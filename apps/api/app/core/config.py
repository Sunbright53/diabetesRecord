from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Cheewarun"
    APP_ENV: str = "development"

    DATABASE_URL: str = "postgresql+asyncpg://cheewarun:changeme@db:5432/cheewarun_db"
    DATABASE_URL_SYNC: str = "postgresql://cheewarun:changeme@db:5432/cheewarun_db"
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"

    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MIN: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3010"]

    MQTT_HOST: str = "mqtt"
    MQTT_PORT: int = 1883
    MQTT_USER: str = "cheewarun_server"
    MQTT_PASS: str = "changeme"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    VAPID_PUBLIC: str = ""
    VAPID_PRIVATE: str = ""
    VAPID_SUBJECT: str = "mailto:plaiad.innovation@gmail.com"

settings = Settings()
