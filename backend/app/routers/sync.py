import os
import json
import socket
import secrets
import random
import time
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

# 局域网配对状态管理
SYNC_PORT = int(os.getenv("SYNC_PORT", "8008"))
MAX_SYNC_NOTES = 500       # 单次同步最大笔记数 (M4: DoS 防护)
MAX_SYNC_NOTEBOOKS = 100   # 单次同步最大笔记本数
PAIRING_CODE_TTL = 300     # 配对码有效期 (秒) — 5分钟自动轮换 (C2)
MAX_PAIR_FAILURES = 5      # 最大连续配对失败次数 (C2)
PAIR_LOCKOUT_SECONDS = 60  # 锁定时长 (秒) (C2)

# 运行时状态
_SERVER_TOKEN = secrets.token_hex(16)
_PAIRED_DEVICES: Dict[str, Dict[str, Any]] = {}

# C2: 配对码自动轮换管理
_pairing_state = {
    "code": str(random.randint(100000, 999999)),  # 6位纯数字码，更易于手机输入
    "created_at": time.time(),
    "fail_count": 0,
    "locked_until": 0.0
}


def _get_or_rotate_pairing_code() -> str:
    """获取当前配对码，若已过期则自动轮换 (C2)"""
    now = time.time()
    if now - _pairing_state["created_at"] > PAIRING_CODE_TTL:
        _pairing_state["code"] = str(random.randint(100000, 999999))
        _pairing_state["created_at"] = now
        _pairing_state["fail_count"] = 0
        _pairing_state["locked_until"] = 0.0
    return _pairing_state["code"]


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
        clean_str = str(dt_val).replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str)
    except Exception:
        return None


def verify_sync_token(token: Optional[str]):
    if not token or (token != _SERVER_TOKEN and token not in _PAIRED_DEVICES):
        raise HTTPException(status_code=401, detail="未授权的同步请求，请先配对设备")


def _serialize_note(n, include_password_hash: bool = False) -> dict:
    """统一笔记序列化工具，C3: 默认过滤 password_hash"""
    try:
        tags = json.loads(n.tags) if n.tags else []
    except Exception:
        tags = []
    result = {
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
        "password_hash": None,  # C3: 密码哈希不通过同步接口传输
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None
    }
    return result


def _serialize_notebook(nb) -> dict:
    return {
        "id": nb.id,
        "name": nb.name,
        "parent_id": nb.parent_id,
        "color": nb.color,
        "icon": nb.icon,
        "sort_order": nb.sort_order,
        "created_at": nb.created_at.isoformat() if nb.created_at else None,
        "updated_at": nb.updated_at.isoformat() if nb.updated_at else None
    }


def _serialize_audio(a) -> dict:
    return {
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
    }


# ─── C1 修复: /info 不再暴露 Token ───

@router.get("/info", response_model=SyncInfoOut)
def get_sync_info():
    """获取 Mac 服务端局域网同步与配对信息（C1: 不再返回 Token）"""
    local_ip = get_local_ip()
    hostname = socket.gethostname()
    device_name = f"Mac ({hostname.split('.')[0]})"
    pairing_code = _get_or_rotate_pairing_code()

    # C1: 二维码仅包含地址与配对码，不包含 Token
    qr_payload = {
        "type": "local_ai_note_sync",
        "server_url": f"http://{local_ip}:{SYNC_PORT}",
        "pairing_code": pairing_code,
        "device_name": device_name,
        "version": "1.0"
    }

    return {
        "server_ip": local_ip,
        "port": SYNC_PORT,
        "device_name": device_name,
        "pairing_code": pairing_code,
        "token": "",  # C1: 不再暴露 Token，Schema 兼容保留空字符串
        "qr_data": json.dumps(qr_payload, ensure_ascii=False)
    }


# ─── C2 修复: 配对接口增加暴力破解防护 ───

@router.post("/pair", response_model=SyncPairOut)
def pair_device(data: SyncPairRequest):
    """iOS / 移动端设备通过配对码请求配对（C2: 含暴力破解防护）"""
    global _PAIRED_DEVICES

    # C2: 检查是否处于锁定状态
    now = time.time()
    if now < _pairing_state["locked_until"]:
        remaining = int(_pairing_state["locked_until"] - now)
        raise HTTPException(
            status_code=429,
            detail=f"配对尝试次数过多，请等待 {remaining} 秒后重试"
        )

    current_code = _get_or_rotate_pairing_code()

    # 验证配对码
    if data.pairing_code.strip() != current_code:
        # C2: 记录失败次数
        _pairing_state["fail_count"] += 1
        if _pairing_state["fail_count"] >= MAX_PAIR_FAILURES:
            _pairing_state["locked_until"] = now + PAIR_LOCKOUT_SECONDS
            _pairing_state["fail_count"] = 0
            # 锁定时自动轮换配对码
            _pairing_state["code"] = str(random.randint(100000, 999999))
            _pairing_state["created_at"] = now
            raise HTTPException(
                status_code=429,
                detail=f"连续 {MAX_PAIR_FAILURES} 次配对失败，已锁定 {PAIR_LOCKOUT_SECONDS} 秒并重新生成配对码"
            )
        raise HTTPException(
            status_code=400,
            detail=f"配对码错误，请重新核对 Mac 屏幕上的 6 位配对码（剩余 {MAX_PAIR_FAILURES - _pairing_state['fail_count']} 次机会）"
        )

    # 配对成功，重置失败计数
    _pairing_state["fail_count"] = 0

    # 为配对设备生成独立 Token
    device_token = secrets.token_hex(16)
    _PAIRED_DEVICES[device_token] = {
        "device_id": data.device_id,
        "device_name": data.device_name,
        "paired_at": datetime.utcnow().isoformat(),
        "last_synced_at": None
    }

    # C1: Token 仅在配对成功后返回
    return {
        "status": "paired",
        "token": device_token,
        "server_name": f"Mac ({socket.gethostname().split('.')[0]})",
        "server_time": datetime.utcnow()
    }


@router.post("/pull", response_model=SyncPullOut)
def pull_changes(data: SyncPullRequest, db: Session = Depends(get_db)):
    """增量拉取自上次同步以来的服务端数据变动"""
    verify_sync_token(data.token)
    last_sync = data.last_sync_time

    nb_query = db.query(Notebook)
    if last_sync:
        nb_query = nb_query.filter(Notebook.updated_at > last_sync)
    notebooks = nb_query.all()

    note_query = db.query(Note)
    if last_sync:
        note_query = note_query.filter(Note.updated_at > last_sync)
    notes = note_query.all()

    audio_query = db.query(AudioRecord)
    if last_sync:
        audio_query = audio_query.filter(AudioRecord.updated_at > last_sync)
    audios = audio_query.all()

    return {
        "notebooks": [_serialize_notebook(nb) for nb in notebooks],
        "notes": [_serialize_note(n) for n in notes],  # C3: password_hash 已过滤
        "audio_records": [_serialize_audio(a) for a in audios],
        "deleted_note_ids": [],
        "deleted_notebook_ids": [],
        "sync_timestamp": datetime.utcnow()
    }


# ─── M4 修复: 同步请求大小限制 + C3: 密码哈希过滤 ───

@router.post("/two-way", response_model=SyncTwoWayOut)
def sync_two_way(data: SyncTwoWayRequest, db: Session = Depends(get_db)):
    """
    一键原子双向增量同步：
    1. 接收 iOS 客户端本地新增与修改的数据，根据 updated_at 智能合并写入 Mac SQLite
    2. 查询 Mac 服务端更新的数据，一并返回给 iOS 客户端更新本地 IndexedDB
    """
    verify_sync_token(data.token)

    # M4: 数据量限制，防止 DoS
    if len(data.notes) > MAX_SYNC_NOTES:
        raise HTTPException(status_code=400, detail=f"单次同步笔记数不能超过 {MAX_SYNC_NOTES} 条")
    if len(data.notebooks) > MAX_SYNC_NOTEBOOKS:
        raise HTTPException(status_code=400, detail=f"单次同步笔记本数不能超过 {MAX_SYNC_NOTEBOOKS} 个")

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
                # C3: 不再接受客户端推送的 password_hash，密码锁定各端独立管理
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
                is_locked=False,  # C3: 新笔记同步时默认不锁定
                password_hash=None,  # C3: 不同步密码哈希
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

    return {
        "status": "success",
        "server_notebooks": [_serialize_notebook(nb) for nb in server_notebooks],
        "server_notes": [_serialize_note(n) for n in server_notes],  # C3: password_hash 已过滤
        "server_audio_records": [_serialize_audio(a) for a in server_audios],
        "server_deleted_note_ids": [],
        "server_deleted_notebook_ids": [],
        "sync_timestamp": sync_now,
        "stats": {
            "pushed_notes_inserted": inserted_notes,
            "pushed_notes_updated": updated_notes,
            "pushed_notebooks_inserted": inserted_notebooks,
            "pushed_notebooks_updated": updated_notebooks,
            "pulled_notes_count": len(server_notes),
            "pulled_notebooks_count": len(server_notebooks)
        }
    }
