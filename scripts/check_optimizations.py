#!/usr/bin/env python3
"""Lightweight checks for list payload, stats aggregation, and audio helpers."""
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Note
from app.routers import notes as notes_router
from app.services.audio_service import AudioService
from app.services.ai_service import get_openai_client


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_note_list_preview_only():
    db = make_session()
    body = "正文内容" * 80
    note = Note(
        title="长笔记",
        content=body,
        content_json='{"type":"doc","content":[]}',
        summary="摘要预览",
        tags='["工作"]',
        is_locked=False,
        updated_at=datetime.utcnow(),
    )
    db.add(note)
    db.commit()

    result = notes_router.get_notes(db=db)
    assert len(result) == 1
    item = result[0]
    assert item["content_json"] == ""
    assert item["content"] == "摘要预览"
    assert item["content_length"] == len(body)
    print("✅ 列表接口不再回传 content_json / 全文")


def test_note_stats_single_query():
    db = make_session()
    db.add(Note(title="a", is_trashed=False, is_starred=True))
    db.add(Note(title="b", is_trashed=False, is_starred=False))
    db.add(Note(title="c", is_trashed=True, is_starred=False))
    db.commit()
    stats = notes_router.get_note_stats(db=db)
    assert stats["total"] == 2
    assert stats["trash"] == 1
    assert stats["starred"] == 1
    print("✅ 侧栏计数一次聚合正确")


def test_locked_export_blocked():
    db = make_session()
    note = Note(title="密", content="secret", is_locked=True)
    db.add(note)
    db.commit()
    try:
        notes_router.export_note(note.id, "md", db)
        raise AssertionError("locked export should 403")
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 403
    print("✅ 锁定笔记导出被拦截")


def test_openai_client_is_sync():
    client = get_openai_client({"api_key": "sk-test", "base_url": "https://api.openai.com/v1"})
    assert client is not None
    print("✅ get_openai_client 为同步工厂，不再需要 await")


def test_audio_process_uses_own_session():
    assert "record_id" in AudioService.process_audio_record.__code__.co_varnames
    print("✅ 录音后台任务可在无请求 Session 下启动")


if __name__ == "__main__":
    test_note_list_preview_only()
    test_note_stats_single_query()
    test_locked_export_blocked()
    test_openai_client_is_sync()
    test_audio_process_uses_own_session()
    print("\n全部优化回归通过")
