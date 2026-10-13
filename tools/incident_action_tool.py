from langchain_core.tools import tool
from utils.logging_config import setup_logger
import uuid, time

logger = setup_logger("incident_action_tool")

@tool
def manage_incident(action: str, details: str) -> str:
    """
    Creates, escalates, or resolves an incident ticket in the ITSM system.
    Args:
        action: The action to perform. Must be one of: 'create', 'escalate', or 'resolve'.
        details: A description of the incident, resolution, or escalation reason.
    Returns:
        A confirmation message with the incident ticket ID and status.
    """
    logger.info(f"Managing incident. Action: {action}, Details: {details}")
    action = action.lower()
    if action not in ["create", "escalate", "resolve"]:
        return f"Error: Invalid action '{action}'. Supported actions are: create, escalate, resolve."
    if not details:
        return "Error: Incident details must be provided."
    try:
        ticket_id = f"INC-{str(uuid.uuid4())[:8].upper()}"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        if action == "create":
            msg = f"Incident created successfully. Ticket ID: {ticket_id}. Status: Open. Timestamp: {timestamp}. Details logged: {details}"
        elif action == "escalate":
            msg = f"Incident escalated successfully. Ticket ID: {ticket_id}. Status: Escalated. Timestamp: {timestamp}. Escalation notes: {details}"
        elif action == "resolve":
            msg = f"Incident resolved successfully. Ticket ID: {ticket_id}. Status: Resolved. Timestamp: {timestamp}. Resolution notes: {details}"
        logger.info(msg)
        return msg
    except Exception as e:
        error_msg = f"Failed to manage incident: {str(e)}"
        logger.error(error_msg)
        return error_msg
