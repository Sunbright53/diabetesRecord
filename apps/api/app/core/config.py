import json
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field
from typing import List
from urllib.parse import quote_plus

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "MetaBreath"
    APP_ENV: str = "development"

    POSTGRES_USER: str = "cheewarun"
    POSTGRES_PASSWORD: str = "changeme"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "cheewarun_db"

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        pw = quote_plus(self.POSTGRES_PASSWORD)
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{pw}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @computed_field
    @property
    def DATABASE_URL_SYNC(self) -> str:
        pw = quote_plus(self.POSTGRES_PASSWORD)
        return f"postgresql://{self.POSTGRES_USER}:{pw}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_REFRESH_SECRET: str = "dev-refresh-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MIN: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS_RAW: str = Field(
        default="http://localhost:3000,http://localhost:3010",
        validation_alias="CORS_ORIGINS",
    )

    @computed_field
    @property
    def CORS_ORIGINS(self) -> List[str]:
        s = self.CORS_ORIGINS_RAW.strip()
        if s.startswith("["):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                pass
        return [x.strip() for x in s.split(",") if x.strip()]

    MQTT_HOST: str = "mqtt"
    MQTT_PORT: int = 1883
    MQTT_USER: str = "api"
    MQTT_PASSWORD: str = ""
    MQTT_ESP32_USER: str = "esp32"
    MQTT_ESP32_PASS: str = ""
    MQTT_BROKER_PUBLIC: str = "metabreath.duckdns.org"
    MQTT_PORT_PUBLIC: int = 1883
    API_BASE_URL: str = "https://metabreath.duckdns.org/api"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    VAPID_PUBLIC: str = ""
    VAPID_PRIVATE: str = ""
    VAPID_SUBJECT: str = "mailto:plaiad.innovation@gmail.com"

    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

settings = Settings()
