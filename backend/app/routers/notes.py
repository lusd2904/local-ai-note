import json
import secrets
import hashlib
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from ..database import get_db
from ..models import Note, Notebook, AudioRecord
from ..schemas import (
    NoteCreate, NoteUpdate, NoteOut,
    NoteLockRequest, NoteUnlockRequest, NoteVerifyPasswordRequest
)

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pw_hash = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}${pw_hash}"

def verify_password(stored_hash: str, password: str) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        salt, pw_hash = stored_hash.split("$", 1)
        expected_hash = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        return secrets.compare_digest(pw_hash, expected_hash)
    except Exception:
        return False

router = APIRouter(prefix="/api/notes", tags=["Notes"])

@router.get("", response_model=List[NoteOut])
def get_notes(
    notebook_id: Optional[str] = None,
    tag: Optional[str] = None,
    is_starred: Optional[bool] = None,
    is_trashed: bool = False,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取笔记列表（支持按笔记本、标签、星标、回收站、关键词搜索过滤）"""
    query = db.query(Note).filter(Note.is_trashed == is_trashed)

    if notebook_id:
        query = query.filter(Note.notebook_id == notebook_id)
    if is_starred is not None:
        query = query.filter(Note.is_starred == is_starred)
    if tag:
        query = query.filter(Note.tags.like(f"%{tag}%"))
    if keyword:
        query = query.filter(
            or_(
                Note.title.ilike(f"%{keyword}%"),
                Note.content.ilike(f"%{keyword}%"),
                Note.summary.ilike(f"%{keyword}%")
            )
        )

    notes = query.order_by(desc(Note.updated_at)).all()

    result = []
    for n in notes:
        audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == n.id).count()
        tags_list = []
        try:
            tags_list = json.loads(n.tags) if n.tags else []
        except Exception:
            tags_list = []
        
        is_locked = bool(n.is_locked)
        note_dict = {
            "id": n.id,
            "title": n.title,
            "content": "" if is_locked else n.content,
            "content_json": "" if is_locked else n.content_json,
            "notebook_id": n.notebook_id,
            "summary": "🔒 此重要笔记已设置密码锁定保护" if is_locked else n.summary,
            "tags": tags_list,
            "is_starred": n.is_starred,
            "is_trashed": n.is_trashed,
            "is_locked": is_locked,
            "created_at": n.created_at,
            "updated_at": n.updated_at,
            "audio_count": audio_count
        }
        result.append(note_dict)
    return result

@router.post("", response_model=NoteOut)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    """新建笔记"""
    tags_str = json.dumps(data.tags or [], ensure_ascii=False)
    note = Note(
        title=data.title or "无标题笔记",
        content=data.content or "",
        content_json=data.content_json or "",
        notebook_id=data.notebook_id,
        summary=data.summary or "",
        tags=tags_str,
        is_starred=data.is_starred or False,
        is_trashed=data.is_trashed or False,
        is_locked=data.is_locked or False
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "content_json": note.content_json,
        "notebook_id": note.notebook_id,
        "summary": note.summary,
        "tags": data.tags or [],
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": bool(note.is_locked),
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": 0
    }

@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: str, db: Session = Depends(get_db)):
    """获取单篇笔记详情"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == note.id).count()
    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    is_locked = bool(note.is_locked)
    return {
        "id": note.id,
        "title": note.title,
        "content": "" if is_locked else note.content,
        "content_json": "" if is_locked else note.content_json,
        "notebook_id": note.notebook_id,
        "summary": "🔒 此重要笔记已设置密码锁定保护" if is_locked else note.summary,
        "tags": tags_list,
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": is_locked,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": audio_count
    }

@router.put("/{note_id}", response_model=NoteOut)
def update_note(note_id: str, data: NoteUpdate, db: Session = Depends(get_db)):
    """更新笔记"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    update_data = data.dict(exclude_unset=True)
    if "tags" in update_data and update_data["tags"] is not None:
        note.tags = json.dumps(update_data["tags"], ensure_ascii=False)
        del update_data["tags"]

    for key, value in update_data.items():
        setattr(note, key, value)

    db.commit()
    db.refresh(note)

    audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == note.id).count()
    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "content_json": note.content_json,
        "notebook_id": note.notebook_id,
        "summary": note.summary,
        "tags": tags_list,
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": bool(note.is_locked),
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": audio_count
    }

@router.post("/{note_id}/lock", response_model=NoteOut)
def lock_note(note_id: str, data: NoteLockRequest, db: Session = Depends(get_db)):
    """给笔记加锁并设置独立密码"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if not data.password or not data.password.strip():
        raise HTTPException(status_code=400, detail="密码不能为空")

    note.is_locked = True
    note.password_hash = hash_password(data.password)
    db.commit()
    db.refresh(note)

    audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == note.id).count()
    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    return {
        "id": note.id,
        "title": note.title,
        "content": "",
        "content_json": "",
        "notebook_id": note.notebook_id,
        "summary": "🔒 此重要笔记已设置密码锁定保护",
        "tags": tags_list,
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": True,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": audio_count
    }

@router.post("/{note_id}/verify-password", response_model=NoteOut)
def verify_note_password(note_id: str, data: NoteVerifyPasswordRequest, db: Session = Depends(get_db)):
    """二次验证笔记密码，验证通过后返回完整笔记内容"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note.is_locked:
        if not note.password_hash or not verify_password(note.password_hash, data.password):
            raise HTTPException(status_code=400, detail="密码错误")

    audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == note.id).count()
    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "content_json": note.content_json,
        "notebook_id": note.notebook_id,
        "summary": note.summary,
        "tags": tags_list,
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": bool(note.is_locked),
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": audio_count
    }

@router.post("/{note_id}/unlock", response_model=NoteOut)
def unlock_note(note_id: str, data: NoteUnlockRequest, db: Session = Depends(get_db)):
    """解除笔记密码锁定"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note.is_locked:
        if not note.password_hash or not verify_password(note.password_hash, data.password):
            raise HTTPException(status_code=400, detail="密码错误")

    note.is_locked = False
    note.password_hash = None
    db.commit()
    db.refresh(note)

    audio_count = db.query(AudioRecord).filter(AudioRecord.note_id == note.id).count()
    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "content_json": note.content_json,
        "notebook_id": note.notebook_id,
        "summary": note.summary,
        "tags": tags_list,
        "is_starred": note.is_starred,
        "is_trashed": note.is_trashed,
        "is_locked": False,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "audio_count": audio_count
    }

@router.delete("/{note_id}")
def delete_note(note_id: str, permanent: bool = False, db: Session = Depends(get_db)):
    """删除笔记（默认移入废纸篓，permanent=True 时物理永久删除）"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if permanent:
        db.delete(note)
        db.commit()
        return {"status": "success", "message": "Note permanently deleted"}
    else:
        note.is_trashed = True
        db.commit()
        return {"status": "success", "message": "Note moved to trash"}

@router.post("/{note_id}/restore")
def restore_note(note_id: str, db: Session = Depends(get_db)):
    """从废纸篓恢复笔记"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.is_trashed = False
    db.commit()
    return {"status": "success", "message": "Note restored successfully"}

@router.delete("/trash/empty")
def empty_trash(db: Session = Depends(get_db)):
    """清空废纸篓"""
    db.query(Note).filter(Note.is_trashed == True).delete()
    db.commit()
    return {"status": "success", "message": "Trash emptied successfully"}

@router.get("/{note_id}/export/docx")
def export_note_docx(note_id: str, db: Session = Depends(get_db)):
    """导出单篇笔记为微软 Word 文档 (.docx)"""
    from fastapi.responses import FileResponse
    from urllib.parse import quote
    from ..services.export_service import ExportService

    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    tags_list = []
    try:
        tags_list = json.loads(note.tags) if note.tags else []
    except Exception:
        tags_list = []

    file_path = ExportService.markdown_to_docx(
        title=note.title,
        content=note.content,
        tags=tags_list,
        updated_at=note.updated_at.strftime("%Y-%m-%d %H:%M") if note.updated_at else None
    )

    filename = f"{note.title or 'note'}.docx"
    encoded_filename = quote(filename)

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )

