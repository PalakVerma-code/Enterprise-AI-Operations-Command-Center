import sqlite3, os
from langchain_core.tools import tool
from utils.logging_config import setup_logger

logger = setup_logger("log_analyzer_tool")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enterprise_mock.db")

@tool
def analyze_logs(service: str, time_range: str = "last 24 hours") -> str:
    """
    Analyzes service logs for errors or anomalies.
    Args:
        service: The name of the service to analyze (e.g., 'Payment API', 'Auth Service').
        time_range: The time range to analyze logs for.
    Returns:
        A formatted string of logs or an error message if the service is not found.
    """
    logger.info(f"Analyzing logs for service: {service}, time_range: {time_range}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT timestamp, level, message FROM service_logs WHERE service = ?", (service,))
        logs = cursor.fetchall()
        if not logs:
            cursor.execute("SELECT DISTINCT service FROM service_logs")
            available = [row[0] for row in cursor.fetchall()]
            conn.close()
            return f"No logs found for service: {service}. Available services: {available}"
        result = f"Logs for {service} ({time_range}):\n"
        for timestamp, level, message in logs:
            result += f"[{timestamp}] {level}: {message}\n"
        conn.close()
        return result
    except Exception as e:
        error_msg = f"Error analyzing logs: {str(e)}"
        logger.error(error_msg)
        return error_msg
