import logging
import sys
import threading

def setup_logger(name: str) -> logging.Logger:
    """Sets up a lightweight logger for NexusOps."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger

class ExecutionMetrics:
    def __init__(self):
        self.llm_calls = 0
        self.tool_calls = 0
        self._lock = threading.Lock()

    def reset(self):
        with self._lock:
            self.llm_calls = 0
            self.tool_calls = 0

    def increment_llm(self):
        with self._lock:
            self.llm_calls += 1

    def increment_tool(self):
        with self._lock:
            self.tool_calls += 1

    def snapshot(self) -> dict:
        with self._lock:
            return {"llm_calls": self.llm_calls, "tool_calls": self.tool_calls}

global_metrics = ExecutionMetrics()
