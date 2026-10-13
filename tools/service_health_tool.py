import sqlite3, os
from langchain_core.tools import tool
from utils.logging_config import setup_logger

logger = setup_logger("service_health_tool")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enterprise_mock.db")

@tool
def check_health(service: str) -> str:
    """
    Checks the current health status and metrics of a service.
    Args:
        service: The name of the service to check (e.g., 'Payment API', 'Auth Service', 'Web Frontend').
    Returns:
        A formatted string detailing the service status and key metrics.
    """
    logger.info(f"Checking health for service: {service}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT status, latency_ms, error_rate FROM service_health WHERE service = ?", (service,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("SELECT DISTINCT service FROM service_health")
            available = [r[0] for r in cursor.fetchall()]
            conn.close()
            return f"Service not found: {service}. Available services: {available}"
        status, latency_ms, error_rate = row
        result = f"Service: {service}\nStatus: {status}\nMetrics:\n- latency_ms: {latency_ms}\n- error_rate: {error_rate}\n"
        conn.close()
        return result
    except Exception as e:
        error_msg = f"Error checking service health: {str(e)}"
        logger.error(error_msg)
        return error_msg
