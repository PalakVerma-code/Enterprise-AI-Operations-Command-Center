import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "llama3-8b-8192")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///agentsync_memory.db")

    @classmethod
    def validate(cls):
        # We allow running in fallback mode if GROQ_API_KEY is not set or standby
        return True

settings = Settings()
