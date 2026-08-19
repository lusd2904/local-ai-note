import os
import json
import socket
import secrets
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Note, Notebook, AudioRecord, AISetting
from ..schemas import (
    SyncInfoOut, SyncPairRequest, SyncPairOut,
    SyncPullRequest, SyncPullOut,
    SyncPushRequest, SyncPushOut,
    SyncTwoWayRequest, SyncTwoWayOut
)

router = APIRouter(prefix="/api/sync", tags=["sync"])

# 局域网配对状态管理（内存缓存）
SYNC_PORT = int(os.getenv("SYNC_PORT", "8008"))
_PAIRING_CODE = secrets.token_hex(3).upper() # 6位十六进制/数字大写配对码
_SERVER_TOKEN = secrets.token_hex(16)
_PAIRED_DEVICES: Dict[str, Dict[str, Any]] = {}

def get_local_ip() -> str:
    """获取本机真实局域网 IP 地址（例如 192.168.1.100）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

def parse_iso_datetime(dt_val: Any) -> Optional[datetime]:
    if not dt_val:
        return None
    if isinstance(dt_val, datetime):
        return dt_val
    try:
        # 支持 ISO 格式字符串转换
        clean_str = str(dt_val).replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str)
    except Exception:
        return None

def verify_sync_token(token: Optional[str]):
    if not token or (token != _SERVER_TOKEN and token not in _PAIRED_DEVICES):
        raise HTTPException(status_code=401, detail="未授权的同步请求，请先配对设备")

@router.get("/info", response_model=SyncInfoOut)
def get_sync_info():
    """获取 Mac 服务端局域网同步与配对信息"""
    global _PAIRING_CODE, _SERVER_TOKEN
    local_ip = get_local_ip()
    hostname = socket.gethostname()
    device_name = f"Mac ({hostname.split('.')[0]})"

    # 生成包含直连地址与配对密钥的二维码数据 Payload
    qr_payload = {
        "type": "local_ai_note_sync",
        "server_url": f"http://{local_ip}:{SYNC_PORT}",
        "pairing_code": _PAIRING_CODE,
        "token": _SERVER_TOKEN,
        "device_name": device_name,
        "version": "1.0"
    }

    return {
        "server_ip": local_ip,
        "port": SYNC_PORT,
        "device_name": device_name,
        "pairing_code": _PAIRING_CODE,
        "token": _SERVER_TOKEN,
        "qr_data": json.dumps(qr_payload, ensure_ascii=False)
    }

@router.post("/pair", response_model=SyncPairOut)
def pair_device(data: SyncPairRequest):
    """iOS / 移动端设备通过配对码或二维码请求配对"""
    global _PAIRING_CODE, _SERVER_TOKEN, _PAIRED_DEVICES
    
    # 验证配对码（大小写不敏感）
    if data.pairing_code.strip().upper() != _PAIRING_CODE.upper():
        raise HTTPException(status_code=400, detail="配对码错误，请重新核对 Mac 屏幕上的 6 位配对码")

    device_token = secrets.token_hex(16)
    _PAIRED_DEVICES[device_token] = {
        "device_id": data.device_id,
        "device_name": data.device_name,
        "paired_at": datetime.utcnow().isoformat(),
        "last_synced_at": None
    }

    return {
        "status": "paired",
        "token": _SERVER_TOKEN, # 双方共享安全 Token
        "server_name": f"Mac ({socket.gethostname().split('.')[0]})",
        "server_time": datetime.utcnow()
    }

@router.post("/pull", response_model=SyncPullOut)
def pull_changes(data: SyncPullRequest, db: Session = Depends(get_db)):
    """增量拉取自上次同步以来的服务端数据变动"""
    verify_sync_token(data.token)
    last_sync = data.last_sync_time

    # 查询增量笔记本
    nb_query = db.query(Notebook)
    if last_sync:
        nb_query = nb_query.filter(Notebook.updated_at > last_sync)
    notebooks = nb_query.all()

    # 查询增量笔记
    note_query = db.query(Note)
    if last_sync:
        note_query = note_query.filter(Note.updated_at > last_sync)
    notes = note_query.all()

    # 查询增量音频
    audio_query = db.query(AudioRecord)
    if last_sync:
        audio_query = audio_query.filter(AudioRecord.updated_at > last_sync)
    audios = audio_query.all()

    # 格式化数据
    notes_list = []
    for n in notes:
        try:
            tags = json.loads(n.tags) if n.tags else []
        except:
            tags = []
        notes_list.append({
            "id": n.id,
            "notebook_id": n.notebook_id,
            "title": n.title,
            "content": n.content,
            "content_json": n.content_json,
            "summary": n.summary,
            "tags": tags,
            "is_starred": bool(n.is_starred),
            "is_trashed": bool(n.is_trashed),
            "is_locked": bool(n.is_locked),
            "password_hash": n.password_hash,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "updated_at": n.updated_at.isoformat() if n.updated_at else None
        })

    notebooks_list = [{
        "id": nb.id,
        "name": nb.name,
        "parent_id": nb.parent_id,
        "color": nb.color,
        "icon": nb.icon,
        "sort_order": nb.sort_order,
        "created_at": nb.created_at.isoformat() if nb.created_at else None,
        "updated_at": nb.updated_at.isoformat() if nb.updated_at else None
    } for nb in notebooks]

    audios_list = [{
        "id": a.id,
        "note_id": a.note_id,
        "file_name": a.file_name,
        "file_path": a.file_path,
        "file_size": a.file_size,
        "duration": a.duration,
        "mime_type": a.mime_type,
        "transcription": a.transcription,
        "ai_summary": a.ai_summary,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None
    } for a in audios]

    return {
        "notebooks": notebooks_list,
        "notes": notes_list,
        "audio_records": audios_list,
        "deleted_note_ids": [],
        "deleted_notebook_ids": [],
        "sync_timestamp": datetime.utcnow()
    }

@router.post("/two-way", response_model=SyncTwoWayOut)
def sync_two_way(data: SyncTwoWayRequest, db: Session = Depends(get_db)):
    """
    一键原子双向增量同步：
    1. 接收 iOS 客户端本地新增与修改的数据，根据 updated_at 智能合并写入 Mac SQLite
    2. 查询 Mac 服务端更新的数据，一并返回给 iOS 客户端更新本地 IndexedDB
    """
    verify_sync_token(data.token)
    sync_now = datetime.utcnow()
    last_sync = data.last_sync_time

    inserted_notes = 0
    updated_notes = 0
    inserted_notebooks = 0
    updated_notebooks = 0

    # 1. 批量合并客户端推上来的笔记本
    for nb_data in data.notebooks:
        nb_id = nb_data.get("id")
        if not nb_id:
            continue
        existing_nb = db.query(Notebook).filter(Notebook.id == nb_id).first()
        client_updated = parse_iso_datetime(nb_data.get("updated_at")) or sync_now
        
        if existing_nb:
            # 若客户端数据更新，则覆盖服务端
            if not existing_nb.updated_at or client_updated > existing_nb.updated_at:
                existing_nb.name = nb_data.get("name", existing_nb.name)
                existing_nb.parent_id = nb_data.get("parent_id")
                existing_nb.color = nb_data.get("color", existing_nb.color)
                existing_nb.icon = nb_data.get("icon", existing_nb.icon)
                existing_nb.sort_order = nb_data.get("sort_order", existing_nb.sort_order)
                existing_nb.updated_at = client_updated
                updated_notebooks += 1
        else:
            new_nb = Notebook(
                id=nb_id,
                name=nb_data.get("name", "新建分类"),
                parent_id=nb_data.get("parent_id"),
                color=nb_data.get("color", "#3B82F6"),
                icon=nb_data.get("icon", "BookOpen"),
                sort_order=nb_data.get("sort_order", 0),
                created_at=parse_iso_datetime(nb_data.get("created_at")) or sync_now,
                updated_at=client_updated
            )
            db.add(new_nb)
            inserted_notebooks += 1

    # 2. 批量合并客户端推上来的笔记
    for note_data in data.notes:
        note_id = note_data.get("id")
        if not note_id:
            continue
        existing_note = db.query(Note).filter(Note.id == note_id).first()
        client_updated = parse_iso_datetime(note_data.get("updated_at")) or sync_now

        tags_str = "[]"
        if "tags" in note_data:
            if isinstance(note_data["tags"], list):
                tags_str = json.dumps(note_data["tags"], ensure_ascii=False)
            elif isinstance(note_data["tags"], str):
                tags_str = note_data["tags"]

        if existing_note:
            if not existing_note.updated_at or client_updated > existing_note.updated_at:
                existing_note.title = note_data.get("title", existing_note.title)
                existing_note.content = note_data.get("content", existing_note.content)
                existing_note.content_json = note_data.get("content_json", existing_note.content_json)
                existing_note.summary = note_data.get("summary", existing_note.summary)
                existing_note.notebook_id = note_data.get("notebook_id")
                existing_note.tags = tags_str
                existing_note.is_starred = bool(note_data.get("is_starred", existing_note.is_starred))
                existing_note.is_trashed = bool(note_data.get("is_trashed", existing_note.is_trashed))
                existing_note.is_locked = bool(note_data.get("is_locked", existing_note.is_locked))
                if note_data.get("password_hash"):
                    existing_note.password_hash = note_data["password_hash"]
                existing_note.updated_at = client_updated
                updated_notes += 1
        else:
            new_note = Note(
                id=note_id,
                notebook_id=note_data.get("notebook_id"),
                title=note_data.get("title", "无标题笔记"),
                content=note_data.get("content", ""),
                content_json=note_data.get("content_json", ""),
                summary=note_data.get("summary", ""),
                tags=tags_str,
                is_starred=bool(note_data.get("is_starred", False)),
                is_trashed=bool(note_data.get("is_trashed", False)),
                is_locked=bool(note_data.get("is_locked", False)),
                password_hash=note_data.get("password_hash"),
                created_at=parse_iso_datetime(note_data.get("created_at")) or sync_now,
                updated_at=client_updated
            )
            db.add(new_note)
            inserted_notes += 1

    # 3. 处理客户端提交的删除 ID
    for del_id in data.deleted_note_ids:
        del_note = db.query(Note).filter(Note.id == del_id).first()
        if del_note:
            del_note.is_trashed = True
            del_note.updated_at = sync_now

    for del_nb_id in data.deleted_notebook_ids:
        del_nb = db.query(Notebook).filter(Notebook.id == del_nb_id).first()
        if del_nb:
            db.delete(del_nb)

    db.commit()

    # 4. 查询服务端需要回传给客户端的增量变动
    server_nb_query = db.query(Notebook)
    if last_sync:
        server_nb_query = server_nb_query.filter(Notebook.updated_at > last_sync)
    server_notebooks = server_nb_query.all()

    server_notes_query = db.query(Note)
    if last_sync:
        server_notes_query = server_notes_query.filter(Note.updated_at > last_sync)
    server_notes = server_notes_query.all()

    server_audios_query = db.query(AudioRecord)
    if last_sync:
        server_audios_query = server_audios_query.filter(AudioRecord.updated_at > last_sync)
    server_audios = server_audios_query.all()

    # 格式化回传
    notes_resp = []
    for n in server_notes:
        try:
            tags = json.loads(n.tags) if n.tags else []
        except:
            tags = []
        notes_resp.append({
            "id": n.id,
            "notebook_id": n.notebook_id,
            "title": n.title,
            "content": n.content,
            "content_json": n.content_json,
            "summary": n.summary,
            "tags": tags,
            "is_starred": bool(n.is_starred),
            "is_trashed": bool(n.is_trashed),
            "is_locked": bool(n.is_locked),
            "password_hash": n.password_hash,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "updated_at": n.updated_at.isoformat() if n.updated_at else None
        })

    notebooks_resp = [{
        "id": nb.id,
        "name": nb.name,
        "parent_id": nb.parent_id,
        "color": nb.color,
        "icon": nb.icon,
        "sort_order": nb.sort_order,
        "created_at": nb.created_at.isoformat() if nb.created_at else None,
        "updated_at": nb.updated_at.isoformat() if nb.updated_at else None
    } for nb in server_notebooks]

    audios_resp = [{
        "id": a.id,
        "note_id": a.note_id,
        "file_name": a.file_name,
        "file_path": a.file_path,
        "file_size": a.file_size,
        "duration": a.duration,
        "mime_type": a.mime_type,
        "transcription": a.transcription,
        "ai_summary": a.ai_summary,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None
    } for a in server_audios]

    return {
        "status": "success",
        "server_notebooks": notebooks_resp,
        "server_notes": notes_resp,
        "server_audio_records": audios_resp,
        "server_deleted_note_ids": [],
        "server_deleted_notebook_ids": [],
        "sync_timestamp": sync_now,
        "stats": {
            "pushed_notes_inserted": inserted_notes,
            "pushed_notes_updated": updated_notes,
            "pushed_notebooks_inserted": inserted_notebooks,
            "pushed_notebooks_updated": updated_notebooks,
            "pulled_notes_count": len(notes_resp),
            "pulled_notebooks_count": len(notebooks_resp)
        }
    }
