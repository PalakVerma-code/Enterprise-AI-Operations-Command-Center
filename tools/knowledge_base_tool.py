import sqlite3, os
from langchain_core.tools import tool
from utils.logging_config import setup_logger

logger = setup_logger("knowledge_base_tool")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enterprise_mock.db")

@tool
def search_runbooks(query: str) -> str:
    """
    Retrieves troubleshooting steps and runbooks from the knowledge base.
    Args:
        query: The service name or error topic to find runbooks for (e.g., 'Payment API', 'Auth Service').
    Returns:
        A formatted string containing the runbook steps, or a not-found message.
    """
    logger.info(f"Searching runbooks for: {query}")
    query = query.lower()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        search_pattern = f"%{query}%"
        cursor.execute(
            "SELECT service, step_description FROM service_runbooks WHERE LOWER(service) LIKE ? ORDER BY service, step_number",
            (search_pattern,)
        )
        rows = cursor.fetchall()
        if not rows:
            cursor.execute("SELECT DISTINCT service FROM service_runbooks")
            available = [r[0] for r in cursor.fetchall()]
            conn.close()
            return f"No runbooks found matching: {query}. Available runbooks for: {available}"
        runbooks = {}
        for service, step in rows:
            if service not in runbooks:
                runbooks[service] = []
            runbooks[service].append(step)
        result = ""
        for service, steps in runbooks.items():
            result += f"Runbook for {service}:\n"
            for step in steps:
                result += f"{step}\n"
            result += "\n"
        conn.close()
        return result
    except Exception as e:
        error_msg = f"Error searching knowledge base: {str(e)}"
        logger.error(error_msg)
        return error_msg
