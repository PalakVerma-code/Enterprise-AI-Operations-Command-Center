from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from workflow.state import AgentState
from config.settings import settings
from utils.logging_config import setup_logger, global_metrics

from tools.log_analyzer_tool import analyze_logs
from tools.service_health_tool import check_health
from tools.incident_history_tool import search_incident_history
from tools.knowledge_base_tool import search_runbooks
from tools.incident_action_tool import manage_incident
from tools.external_api_tool import check_external_service_status

logger = setup_logger("investigation_agent")

def run_investigation(state: AgentState) -> AgentState:
    logger.info("Investigation Agent started.")
    if state.get("investigation_results"):
        logger.info("Investigation results already exist. Skipping LLM call.")
        return state
    try:
        llm = ChatGroq(api_key=settings.GROQ_API_KEY, model=settings.DEFAULT_MODEL)
        tools = [analyze_logs, check_health, search_incident_history, search_runbooks, manage_incident, check_external_service_status]
        system_msg = "You are the Investigation Agent for IT Incident Resolution. Intelligently select and use the available tools to investigate the incident based on the plan. Gather logs, health status, history, and runbooks. You can also ping external services using check_external_service_status. Do not provide final analysis, only gather evidence and data."
        agent = create_react_agent(llm, tools, prompt=system_msg)
        logger.info("Calling Groq API for investigation via ReAct Agent.")
        inputs = {"messages": [HumanMessage(content=f"User Request: {state['user_request']}\nPlan: {state['plan']}")]}
        result = agent.invoke(inputs)
        final_message = result["messages"][-1].content
        ai_msg_count = sum(1 for m in result["messages"] if m.type == "ai")
        for _ in range(ai_msg_count):
            global_metrics.increment_llm()
        tool_msg_count = sum(1 for m in result["messages"] if m.type == "tool")
        for _ in range(tool_msg_count):
            global_metrics.increment_tool()
        state["investigation_results"] = final_message
        state["workflow_status"] = "Investigated"
    except Exception as e:
        logger.warning(f"Investigation Agent LLM unavailable ({e}). Running direct diagnostic tools on enterprise mock DB.")
        req_lower = state.get("user_request", "").lower()
        service = "payment-service" if "pay" in req_lower else "auth-service" if "auth" in req_lower else "web-frontend" if "web" in req_lower or "front" in req_lower else "payment-service"
        
        health_info = check_health.invoke({"service": service})
        logs_info = analyze_logs.invoke({"service": service, "time_range": "last_1_hour"})
        runbooks_info = search_runbooks.invoke({"query": service})
        global_metrics.increment_tool()
        global_metrics.increment_tool()
        global_metrics.increment_tool()

        state["investigation_results"] = (
            f"### Automated Diagnostics Collected for `{service}`\n\n"
            f"**1. Health Telemetry:**\n```json\n{health_info}\n```\n\n"
            f"**2. Error Logs (`analyze_logs`):**\n```\n{logs_info}\n```\n\n"
            f"**3. Runbook Recommendations:**\n{runbooks_info}"
        )
        state["workflow_status"] = "Investigated"
    return state
