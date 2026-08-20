from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

connect_args = {"check_same_thread": False}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["timeout"] = 15

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def ensure_indexes():
    """Idempotent indexes for list/search/count hot paths."""
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_notes_updated_at ON notes (updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_notes_notebook_id ON notes (notebook_id)",
        "CREATE INDEX IF NOT EXISTS ix_notes_trashed ON notes (is_trashed)",
        "CREATE INDEX IF NOT EXISTS ix_notes_starred ON notes (is_starred)",
        "CREATE INDEX IF NOT EXISTS ix_audio_note_id ON audio_records (note_id)",
        "CREATE INDEX IF NOT EXISTS ix_memos_created_at ON memos (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_database_rows_db_id ON database_rows (database_id)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
