from typing import TypedDict, List, Dict, Any

class AgentState(TypedDict):
    user_request: str
    plan: str
    investigation_results: str
    analysis: str
    decision: str
    workflow_status: str
    errors: List[str]
    execution_metadata: Dict[str, Any]
