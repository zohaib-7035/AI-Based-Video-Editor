import os
import shutil

# Must be set before app modules are imported so pydantic-settings picks them up.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_database.db")
os.environ.setdefault("STORAGE_DIR", "./test_storage")
os.environ.setdefault("LOG_FILE", "./logs/test_app.log")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    """Function-scoped DB session for direct record queries in tests."""
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_artifacts():
    yield
    from app.core.database import engine
    engine.dispose()  # release SQLite file handle before deletion (Windows)
    for path in ("test_database.db", "test_storage"):
        try:
            if os.path.isfile(path):
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            pass
