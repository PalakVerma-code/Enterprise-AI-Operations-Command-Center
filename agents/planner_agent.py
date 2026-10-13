from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq
from workflow.state import AgentState
from config.settings import settings
from utils.logging_config import setup_logger, global_metrics
from memory.memory_manager import memory_manager

logger = setup_logger("planner_agent")

def run_planner(state: AgentState) -> AgentState:
    logger.info("Planner Agent started.")
    if state.get("plan"):
        logger.info("Plan already exists. Skipping LLM call.")
        return state
    try:
        llm = ChatGroq(api_key=settings.GROQ_API_KEY, model=settings.DEFAULT_MODEL)
        system_msg = SystemMessage(content="""You are the Planner Agent for an IT Incident Resolution Engine.
Your job is to understand the incident request and break it down into a clear, structured investigation plan.
Identify which tools and steps are required (e.g., check health, analyze logs, search history).
Do not perform the investigation yourself. Just output the step-by-step plan.

IMPORTANT RULE: This interface is STRICTLY for IT Incident Resolution. If the user provides a generalized prompt or a prompt for any other use case (e.g., 'Analyze sales data', 'Write a poem', 'Plan a vacation'), you MUST reject it.
In such cases, your response must be exactly: "This interface is for IT Incident Resolution. Here is what I can do: I can investigate service outages, analyze application logs, check service health, and help resolve IT incidents." Do not output a plan if you reject the prompt.
If past similar plans are provided, use them to structure your current plan efficiently.
""")
        keywords = state['user_request'].split()
        search_keyword = keywords[0] if keywords else ""
        if len(keywords) > 2:
            search_keyword = max(keywords[:5], key=len)
        past_plans = memory_manager.get_past_decisions(search_keyword)
        memory_context = ""
        if past_plans:
            memory_context = "\n\nPast Historical Context:\n"
            for req, dec in past_plans:
                memory_context += f"- Past Request: {req}\n"
        human_msg = HumanMessage(content=f"Business Request: {state['user_request']}{memory_context}")
        logger.info("Calling Groq API for planning.")
        response = llm.invoke([system_msg, human_msg])
        global_metrics.increment_llm()
        state["plan"] = response.content
        state["workflow_status"] = "Planned"
    except Exception as e:
        logger.warning(f"Planner Agent LLM unavailable ({e}). Using deterministic enterprise triage planner.")
        req = state.get("user_request", "Incident")
        state["plan"] = (
            f"### Automated Incident Investigation Plan\n\n"
            f"**Target System Issue:** {req}\n\n"
            f"**Planned Diagnostic Phases:**\n"
            f"1. **Service Health Audit:** Execute `check_health` across affected backend microservices and databases.\n"
            f"2. **Log Correlation:** Run `analyze_logs` filtering for FATAL, ERROR, and 5xx exception tracebacks.\n"
            f"3. **Knowledge Base Search:** Query `search_runbooks` and `search_incident_history` for matching mitigation playbooks.\n"
            f"4. **Root Cause Synthesis & Action:** Formulate mitigation steps and generate ticket if human escalation is required."
        )
        state["workflow_status"] = "Planned"
    return state
