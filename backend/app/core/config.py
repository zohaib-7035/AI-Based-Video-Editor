from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    app_env: str = "development"
    app_version: str = "1.0.0"

    # Database
    database_url: str = "sqlite:///./database.db"

    # Storage
    storage_dir: str = "./storage"

    # Logging
    log_level: str = "INFO"
    log_file: str = "./logs/app.log"

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3"

    # Whisper
    whisper_model: str = "base"

    # Upload
    max_upload_size_mb: int = 2048

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        return p if p.is_absolute() else Path(__file__).resolve().parent.parent.parent / p

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"

    @property
    def exports_path(self) -> Path:
        return self.storage_path / "exports"

    @property
    def temp_path(self) -> Path:
        return self.storage_path / "temp"

    @property
    def subtitles_path(self) -> Path:
        return self.storage_path / "subtitles"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()
