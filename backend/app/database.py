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
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA temp_store=MEMORY")
    finally:
        cursor.close()


def ensure_indexes():
    """Idempotent indexes for list/search/count hot paths."""
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_notes_updated_at ON notes (updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_notes_notebook_id ON notes (notebook_id)",
        "CREATE INDEX IF NOT EXISTS ix_notes_trashed ON notes (is_trashed)",
        "CREATE INDEX IF NOT EXISTS ix_notes_starred ON notes (is_starred)",
        "CREATE INDEX IF NOT EXISTS ix_notes_trashed_updated ON notes (is_trashed, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_notes_notebook_trashed_updated ON notes (notebook_id, is_trashed, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_notes_trashed_starred ON notes (is_trashed, is_starred)",
        "CREATE INDEX IF NOT EXISTS ix_audio_note_id ON audio_records (note_id)",
        "CREATE INDEX IF NOT EXISTS ix_audio_created_at ON audio_records (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_audio_updated_at ON audio_records (updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_memos_created_at ON memos (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_memos_updated_at ON memos (updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_memos_archived_pinned_created ON memos (is_archived, is_pinned, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_notebooks_updated_at ON notebooks (updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_databases_archived ON databases (is_archived, notebook_id)",
        "CREATE INDEX IF NOT EXISTS ix_database_rows_db_id ON database_rows (database_id)",
        "CREATE INDEX IF NOT EXISTS ix_database_rows_db_order ON database_rows (database_id, order_index)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception as exc:
                print(f"[database] failed to create index: {exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
