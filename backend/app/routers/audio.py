import os
import json
import uuid
import aiofiles
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..database import get_db
from ..models import AudioRecord, Note, Notebook
from ..schemas import AudioRecordOut
from ..services.audio_service import AudioService
from ..config import AUDIO_DIR

router = APIRouter(prefix="/api/audio", tags=["Audio & Meeting Minutes"])

def format_record_dict(record: AudioRecord) -> dict:
    segments = []
    action_items = []
    try:
        segments = json.loads(record.transcription_segments) if record.transcription_segments else []
    except Exception:
        segments = []
    try:
        action_items = json.loads(record.action_items) if record.action_items else []
    except Exception:
        action_items = []

    file_name = os.path.basename(record.file_path)
    file_url = f"/api/uploads/audio/{file_name}"

    return {
        "id": record.id,
        "note_id": record.note_id,
        "file_name": record.file_name,
        "file_path": record.file_path,
        "file_url": file_url,
        "file_size": record.file_size,
        "duration": record.duration,
        "mime_type": record.mime_type,
        "transcription": record.transcription,
        "transcription_segments": segments,
        "ai_summary": record.ai_summary,
        "action_items": action_items,
        "status": record.status,
        "error_msg": record.error_msg,
        "created_at": record.created_at
    }

@router.get("", response_model=List[AudioRecordOut])
def get_all_audio_records(note_id: Optional[str] = None, db: Session = Depends(get_db)):
    """获取录音列表（可选按 note_id 过滤）"""
    query = db.query(AudioRecord)
    if note_id:
        query = query.filter(AudioRecord.note_id == note_id)
    records = query.order_by(desc(AudioRecord.created_at)).all()
    return [format_record_dict(r) for r in records]

@router.get("/{record_id}", response_model=AudioRecordOut)
def get_audio_record(record_id: str, db: Session = Depends(get_db)):
    """获取单个录音详情与分析结果"""
    record = db.query(AudioRecord).filter(AudioRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="AudioRecord not found")
    return format_record_dict(record)

@router.post("/upload", response_model=AudioRecordOut)
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    note_id: Optional[str] = Form(None),
    auto_process: bool = Form(True),
    db: Session = Depends(get_db)
):
    """上传录音文件 (mp3/m4a/wav/aac等) 并触发智能转录与纪要分析"""
    ext = os.path.splitext(file.filename)[1].lower() or ".mp3"
    unique_filename = f"{uuid.uuid4()}{ext}"
    dest_path = AUDIO_DIR / unique_filename

    # 保存文件到本地物理磁盘
    file_size = 0
    async with aiofiles.open(dest_path, "wb") as out_file:
        while content := await file.read(1024 * 1024):
            file_size += len(content)
            await out_file.write(content)

    record = AudioRecord(
        note_id=note_id if note_id and note_id != "undefined" else None,
        file_name=file.filename,
        file_path=str(dest_path),
        file_size=file_size,
        mime_type=file.content_type or "audio/mpeg",
        status="processing" if auto_process else "idle"
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    if auto_process:
        # 异步执行 ASR 转录与 AI 纪要提炼
        background_tasks.add_task(AudioService.process_audio_record, record.id, db)

    return format_record_dict(record)

@router.post("/{record_id}/process", response_model=AudioRecordOut)
async def process_audio(record_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """手动触发或重新分析录音"""
    record = db.query(AudioRecord).filter(AudioRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="AudioRecord not found")
    
    record.status = "processing"
    db.commit()

    background_tasks.add_task(AudioService.process_audio_record, record.id, db)
    return format_record_dict(record)

@router.post("/{record_id}/convert-to-note")
def convert_audio_to_note(record_id: str, notebook_id: Optional[str] = None, db: Session = Depends(get_db)):
    """将录音转录与 AI 纪要一键转化为正式笔记"""
    record = db.query(AudioRecord).filter(AudioRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="AudioRecord not found")

    # 提取纪要 JSON
    minutes_dict = {}
    try:
        minutes_dict = json.loads(record.ai_summary) if record.ai_summary else {}
    except Exception:
        minutes_dict = {}

    title = minutes_dict.get("title") or f"会议纪要 - {record.file_name}"
    overview = minutes_dict.get("overview") or "无概要说明"
    key_decisions = minutes_dict.get("key_decisions") or []
    action_items = minutes_dict.get("action_items") or []

    # 拼接富文本/Markdown 内容
    content_lines = [
        f"# {title}\n",
        f"🎙️ **录音文件**: `{record.file_name}`  | 🕒 **转录时间**: {record.created_at.strftime('%Y-%m-%d %H:%M')}\n",
        "## 📌 会议概要",
        f"{overview}\n",
        "## 🎯 核心结论与决策"
    ]
    for d in key_decisions:
        content_lines.append(f"- {d}")
    
    content_lines.append("\n## ✅ 行动项与待办清单")
    for item in action_items:
        task = item.get("task", "") if isinstance(item, dict) else str(item)
        assignee = f" (负责人: {item.get('assignee')})" if isinstance(item, dict) and item.get("assignee") else ""
        content_lines.append(f"- [ ] {task}{assignee}")

    content_lines.append("\n## 📝 完整逐字稿记录")
    content_lines.append(f"> {record.transcription}\n")

    full_content = "\n".join(content_lines)

    new_note = Note(
        title=title,
        content=full_content,
        notebook_id=notebook_id,
        summary=overview[:150],
        tags=json.dumps(["语音纪要", "会议"], ensure_ascii=False)
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    # 关联录音到这篇笔记
    record.note_id = new_note.id
    db.commit()

    return {"status": "success", "note_id": new_note.id, "message": "Successfully created note from audio"}

@router.delete("/{record_id}")
def delete_audio_record(record_id: str, db: Session = Depends(get_db)):
    """删除录音及本地物理音频文件"""
    record = db.query(AudioRecord).filter(AudioRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="AudioRecord not found")

    if os.path.exists(record.file_path):
        try:
            os.remove(record.file_path)
        except Exception:
            pass

    db.delete(record)
    db.commit()
    return {"status": "success", "message": "Audio record deleted successfully"}
