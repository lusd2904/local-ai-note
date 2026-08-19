import json
import re
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..database import get_db
from ..models import Memo, Note, Notebook
from ..schemas import (
    MemoCreate, MemoUpdate, MemoOut, MemoConvertToNoteRequest, NoteOut
)

router = APIRouter(prefix="/api/memos", tags=["Memos"])

def extract_tags_from_content(content: str) -> List[str]:
    """从闪念内容中自动提取 #标签 (例如 #灵感 #思考)"""
    tags = re.findall(r'#([\w\u4e00-\u9fa5]+)', content)
    return list(set(tags))

@router.get("", response_model=List[MemoOut])
def get_memos(
    tag: Optional[str] = None,
    keyword: Optional[str] = None,
    is_archived: bool = False,
    db: Session = Depends(get_db)
):
    """获取闪念速记流列表 (支持置顶优先与倒序排列)"""
    query = db.query(Memo).filter(Memo.is_archived == is_archived)

    if keyword:
        query = query.filter(Memo.content.contains(keyword))

    memos = query.order_by(desc(Memo.is_pinned), desc(Memo.created_at)).all()

    result = []
    for m in memos:
        try:
            tags = json.loads(m.tags) if m.tags else []
        except Exception:
            tags = []
        try:
            images = json.loads(m.images) if m.images else []
        except Exception:
            images = []

        if tag and tag not in tags:
            continue

        result.append({
            "id": m.id,
            "content": m.content,
            "images": images,
            "tags": tags,
            "is_pinned": bool(m.is_pinned),
            "is_archived": bool(m.is_archived),
            "created_at": m.created_at,
            "updated_at": m.updated_at
        })
    return result

@router.post("", response_model=MemoOut)
def create_memo(data: MemoCreate, db: Session = Depends(get_db)):
    """新建闪念速记 (自动提取正文中的 #标签)"""
    auto_tags = extract_tags_from_content(data.content)
    merged_tags = list(set((data.tags or []) + auto_tags))

    memo = Memo(
        content=data.content,
        images=json.dumps(data.images or [], ensure_ascii=False),
        tags=json.dumps(merged_tags, ensure_ascii=False),
        is_pinned=bool(data.is_pinned),
        is_archived=False
    )
    db.add(memo)
    db.commit()
    db.refresh(memo)

    return {
        "id": memo.id,
        "content": memo.content,
        "images": data.images or [],
        "tags": merged_tags,
        "is_pinned": bool(memo.is_pinned),
        "is_archived": bool(memo.is_archived),
        "created_at": memo.created_at,
        "updated_at": memo.updated_at
    }

@router.put("/{memo_id}", response_model=MemoOut)
def update_memo(memo_id: str, data: MemoUpdate, db: Session = Depends(get_db)):
    """修改或置顶闪念速记"""
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="闪念速记不存在")

    if data.content is not None:
        memo.content = data.content
        auto_tags = extract_tags_from_content(data.content)
        tags_list = data.tags if data.tags is not None else (json.loads(memo.tags) if memo.tags else [])
        memo.tags = json.dumps(list(set(tags_list + auto_tags)), ensure_ascii=False)

    if data.images is not None:
        memo.images = json.dumps(data.images, ensure_ascii=False)

    if data.is_pinned is not None:
        memo.is_pinned = data.is_pinned

    if data.is_archived is not None:
        memo.is_archived = data.is_archived

    memo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(memo)

    try:
        tags = json.loads(memo.tags) if memo.tags else []
    except Exception:
        tags = []
    try:
        images = json.loads(memo.images) if memo.images else []
    except Exception:
        images = []

    return {
        "id": memo.id,
        "content": memo.content,
        "images": images,
        "tags": tags,
        "is_pinned": bool(memo.is_pinned),
        "is_archived": bool(memo.is_archived),
        "created_at": memo.created_at,
        "updated_at": memo.updated_at
    }

@router.delete("/{memo_id}")
def delete_memo(memo_id: str, db: Session = Depends(get_db)):
    """删除闪念速记"""
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="闪念速记不存在")
    db.delete(memo)
    db.commit()
    return {"status": "deleted", "id": memo_id}

@router.post("/convert-to-note")
def convert_memos_to_note(data: MemoConvertToNoteRequest, db: Session = Depends(get_db)):
    """将选中的多条闪念一键聚合转化为正式长篇笔记"""
    if not data.memo_ids:
        raise HTTPException(status_code=400, detail="请至少选择一条闪念记录")

    memos = db.query(Memo).filter(Memo.id.in_(data.memo_ids)).order_by(Memo.created_at).all()
    if not memos:
        raise HTTPException(status_code=404, detail="未找到指定的闪念记录")

    # 组合为结构化 Markdown
    lines = [f"# {data.title or '闪念灵感汇总'}\n"]
    lines.append(f"> ⚡️ 本篇笔记由 {len(memos)} 条闪念速记一键汇聚生成于 {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    
    all_tags = set()
    for idx, m in enumerate(memos, 1):
        time_str = m.created_at.strftime('%Y-%m-%d %H:%M') if m.created_at else ""
        lines.append(f"### 💡 闪念记录 #{idx} ({time_str})")
        lines.append(m.content)
        
        try:
            imgs = json.loads(m.images) if m.images else []
            for img_url in imgs:
                lines.append(f"\n![]({img_url})\n")
        except Exception:
            pass

        try:
            m_tags = json.loads(m.tags) if m.tags else []
            for t in m_tags:
                all_tags.add(t)
        except Exception:
            pass

        lines.append("\n---\n")

    full_content = "\n".join(lines)
    all_tags.add("闪念整理")

    # 创建正式笔记
    new_note = Note(
        notebook_id=data.notebook_id,
        title=data.title or f"闪念灵感汇总 ({datetime.now().strftime('%m-%d')})",
        content=full_content,
        content_json="",
        summary=f"汇聚了 {len(memos)} 条闪念灵感片段。",
        tags=json.dumps(list(all_tags), ensure_ascii=False),
        is_starred=False,
        is_trashed=False,
        is_locked=False
    )
    db.add(new_note)

    # 标记已归档
    for m in memos:
        m.is_archived = True

    db.commit()
    db.refresh(new_note)

    return {
        "status": "converted",
        "note_id": new_note.id,
        "note_title": new_note.title,
        "memo_count": len(memos)
    }
