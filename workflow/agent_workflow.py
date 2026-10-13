import time
from langgraph.graph import StateGraph, END
from workflow.state import AgentState
from agents.planner_agent import run_planner
from agents.investigation_agent import run_investigation
from agents.analysis_agent import run_analysis
from agents.decision_agent import run_decision
from utils.logging_config import setup_logger, global_metrics
from memory.memory_manager import memory_manager

logger = setup_logger("agent_workflow")

def evaluate_risk(state: AgentState) -> AgentState:
    """Evaluates the risk level from the analysis output."""
    analysis_text = state.get("analysis", "").lower()
    if "high risk" in analysis_text:
        state["workflow_status"] = "High Risk - Human Review Required"
    elif "medium risk" in analysis_text:
        state["workflow_status"] = "Medium Risk"
    else:
        state["workflow_status"] = "Low Risk"
    logger.info(f"Risk Evaluation complete: {state['workflow_status']}")
    return state

def route_after_risk(state: AgentState):
    status = state.get("workflow_status", "")
    if "High Risk" in status:
        return "decision"
    elif "Medium Risk" in status:
        return "investigation"
    else:
        return "decision"

def build_workflow():
    workflow = StateGraph(AgentState)
    workflow.add_node("planner", run_planner)
    workflow.add_node("investigation", run_investigation)
    workflow.add_node("analysis", run_analysis)
    workflow.add_node("risk_evaluation", evaluate_risk)
    workflow.add_node("decision", run_decision)
    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "investigation")
    workflow.add_edge("investigation", "analysis")
    workflow.add_edge("analysis", "risk_evaluation")
    workflow.add_conditional_edges(
        "risk_evaluation",
        route_after_risk,
        {"investigation": "investigation", "decision": "decision"}
    )
    workflow.add_edge("decision", END)
    return workflow.compile()

def run_agent_workflow(user_request: str) -> AgentState:
    logger.info(f"Starting NexusOps IT workflow for: {user_request}")
    start_time = time.time()
    global_metrics.reset()
    initial_state = AgentState(
        user_request=user_request,
        plan="",
        investigation_results="",
        analysis="",
        decision="",
        workflow_status="Started",
        errors=[],
        execution_metadata={}
    )
    app = build_workflow()
    try:
        final_state = app.invoke(initial_state)
    except Exception as e:
        logger.error(f"Workflow execution failed: {e}")
        initial_state["errors"].append(str(e))
        initial_state["workflow_status"] = "Error"
        final_state = initial_state
    duration = time.time() - start_time
    final_state["execution_metadata"] = {
        "duration_seconds": round(duration, 2),
        "llm_calls": global_metrics.llm_calls,
        "tool_calls": global_metrics.tool_calls
    }
    memory_manager.save_workflow(final_state)
    logger.info(f"Workflow completed in {duration:.2f} seconds.")
    return final_state
