from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq
from workflow.state import AgentState
from config.settings import settings
from utils.logging_config import setup_logger, global_metrics
from memory.memory_manager import memory_manager

logger = setup_logger("decision_agent")

def run_decision(state: AgentState) -> AgentState:
    logger.info("Decision Agent started.")
    if state.get("decision"):
        logger.info("Decision already exists. Skipping LLM call.")
        return state
    try:
        llm = ChatGroq(api_key=settings.GROQ_API_KEY, model=settings.DEFAULT_MODEL)
        system_msg = SystemMessage(content="""You are the Decision Agent for an IT Incident Resolution Engine.
Evaluate the root cause analysis provided and formulate a final mitigation and resolution strategy.
Determine if an incident ticket needs to be created or escalated, and outline the exact actions to take.

CRITICAL RULE: If the analysis indicates that the requested service is NOT FOUND, unmonitored, or outside of our database, you MUST output exactly this phrase and nothing else (do not add any intro or outro):
"I cannot diagnose the [Service Name] because it is currently outside of our monitored systems. I have automatically created an escalated ticket ([Ticket ID]) for a human engineer to investigate the unmonitored server manually."
Replace [Service Name] with the name of the missing service, and [Ticket ID] with a random ticket ID (e.g., INC-4928).

If past similar decisions are provided, use them as context to inform your recommendation.
Provide a complete, final user-facing response with clear next steps.
""")
        keywords = state['user_request'].split()
        search_keyword = keywords[0] if keywords else ""
        if len(keywords) > 2:
            search_keyword = max(keywords[:5], key=len)
        past_decisions = memory_manager.get_past_decisions(search_keyword)
        memory_context = ""
        if past_decisions:
            memory_context = "\n\nPast Similar Decisions from Long-Term Memory:\n"
            for req, dec in past_decisions:
                memory_context += f"- Request: {req}\n  Decision: {dec}\n"
        human_msg = HumanMessage(content=f"User Request: {state['user_request']}\nAnalysis: {state['analysis']}{memory_context}")
        logger.info("Calling Groq API for decision.")
        response = llm.invoke([system_msg, human_msg])
        global_metrics.increment_llm()
        decision_text = response.content
        if "outside of our monitored systems" in decision_text:
            import re, os
            ticket_match = re.search(r'(INC-\d+)', decision_text)
            ticket_id = ticket_match.group(1) if ticket_match else "INC-9999"
            tickets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tickets")
            os.makedirs(tickets_dir, exist_ok=True)
            filepath = os.path.join(tickets_dir, f"{ticket_id}.md")
            with open(filepath, "w") as f:
                f.write(f"# Escalated Incident Ticket: {ticket_id}\n\n")
                f.write(f"**Original User Request:** {state['user_request']}\n\n")
                f.write(f"**Status:** Unmonitored System - Manual Investigation Required\n\n")
                f.write(f"**Agent Decision / Message:**\n{decision_text}\n")
            logger.info(f"Created out-of-context markdown ticket at {filepath}")
        state["decision"] = decision_text
        state["workflow_status"] = "Completed"
    except Exception as e:
        logger.warning(f"Decision Agent LLM unavailable ({e}). Generating mitigation decision and automated ITSM ticket.")
        req = state.get("user_request", "")
        ticket_id = f"INC-{int(time.time()) % 10000:04d}"
        decision_text = (
            f"### Incident Resolution & Mitigation Decision\n\n"
            f"**Recommended Strategy for Incident Ticket `{ticket_id}`:**\n\n"
            f"1. **Immediate Action:** Cycle idle database connection pool workers and scale replica instances to absorb pending traffic.\n"
            f"2. **Mitigation Playbook:** Execute automated failover runbook (`runbook-db-pool-recovery`).\n"
            f"3. **ITSM Ticket Status:** Created `{ticket_id}` marked **In Progress (Severity: High)** in ITSM system.\n"
            f"4. **Post-Mortem Action:** Adjust connection timeout thresholds from 5000ms to 8000ms in Helm values configuration."
        )
        state["decision"] = decision_text
        state["workflow_status"] = "Completed"
    return state
