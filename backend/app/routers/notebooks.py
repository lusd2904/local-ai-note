from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Notebook, Note
from ..schemas import NotebookCreate, NotebookUpdate, NotebookOut

router = APIRouter(prefix="/api/notebooks", tags=["Notebooks"])

def get_all_descendant_ids(notebook_id: str, db: Session) -> List[str]:
    """递归获取某个笔记本下的所有子孙笔记本 ID"""
    descendant_ids = [notebook_id]
    children = db.query(Notebook).filter(Notebook.parent_id == notebook_id).all()
    for child in children:
        descendant_ids.extend(get_all_descendant_ids(child.id, db))
    return descendant_ids

@router.get("", response_model=List[NotebookOut])
def get_all_notebooks(db: Session = Depends(get_db)):
    """获取所有笔记本列表（附带笔记计数）"""
    notebooks = db.query(Notebook).order_by(Notebook.sort_order.asc(), Notebook.created_at.asc()).all()
    count_rows = (
        db.query(Note.notebook_id, func.count(Note.id))
        .filter(Note.is_trashed == False)
        .group_by(Note.notebook_id)
        .all()
    )
    count_map = {nid: int(cnt) for nid, cnt in count_rows}
    result = []
    for nb in notebooks:
        nb_dict = {
            "id": nb.id,
            "name": nb.name,
            "parent_id": nb.parent_id if nb.parent_id else None,
            "color": nb.color,
            "icon": nb.icon,
            "sort_order": nb.sort_order,
            "created_at": nb.created_at,
            "updated_at": nb.updated_at,
            "note_count": count_map.get(nb.id, 0)
        }
        result.append(nb_dict)
    return result

@router.post("", response_model=NotebookOut)
def create_notebook(data: NotebookCreate, db: Session = Depends(get_db)):
    """新建笔记本/文件夹 (支持指定 parent_id 多级嵌套)"""
    parent_id = data.parent_id.strip() if data.parent_id and data.parent_id.strip() else None
    
    if parent_id:
        parent = db.query(Notebook).filter(Notebook.id == parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent notebook not found")

    nb_data = data.dict()
    nb_data["parent_id"] = parent_id

    nb = Notebook(**nb_data)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    
    return {
        "id": nb.id,
        "name": nb.name,
        "parent_id": nb.parent_id,
        "color": nb.color,
        "icon": nb.icon,
        "sort_order": nb.sort_order,
        "created_at": nb.created_at,
        "updated_at": nb.updated_at,
        "note_count": 0
    }

@router.put("/{notebook_id}", response_model=NotebookOut)
def update_notebook(notebook_id: str, data: NotebookUpdate, db: Session = Depends(get_db)):
    """更新笔记本（重命名、修改所属父级等）"""
    nb = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    update_dict = data.dict(exclude_unset=True)
    if "parent_id" in update_dict:
        pid = update_dict["parent_id"]
        update_dict["parent_id"] = pid.strip() if pid and pid.strip() else None
        if update_dict["parent_id"] == notebook_id:
            raise HTTPException(status_code=400, detail="Cannot set a notebook as its own parent")

    for key, value in update_dict.items():
        setattr(nb, key, value)
    
    db.commit()
    db.refresh(nb)
    note_count = db.query(Note).filter(Note.notebook_id == nb.id, Note.is_trashed == False).count()
    return {
        "id": nb.id,
        "name": nb.name,
        "parent_id": nb.parent_id,
        "color": nb.color,
        "icon": nb.icon,
        "sort_order": nb.sort_order,
        "created_at": nb.created_at,
        "updated_at": nb.updated_at,
        "note_count": note_count
    }

@router.delete("/{notebook_id}")
def delete_notebook(notebook_id: str, db: Session = Depends(get_db)):
    """删除文件夹（递归删除所有子文件夹，并将其下的所有笔记安全移至未分类）"""
    nb = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")

    # 1. 递归获取所有需要删除的文件夹 ID (包括当前文件夹及其所有子孙)
    all_ids_to_delete = get_all_descendant_ids(notebook_id, db)

    # 2. 将这些文件夹下的所有笔记移至未分类 (notebook_id = None)
    db.query(Note).filter(Note.notebook_id.in_(all_ids_to_delete)).update(
        {"notebook_id": None}, synchronize_session=False
    )

    # 3. 批量删除这些文件夹
    db.query(Notebook).filter(Notebook.id.in_(all_ids_to_delete)).delete(synchronize_session=False)
    db.commit()

    return {
        "status": "success",
        "deleted_ids": all_ids_to_delete,
        "deleted_count": len(all_ids_to_delete),
        "message": f"Successfully deleted notebook and {len(all_ids_to_delete) - 1} subfolders."
    }
