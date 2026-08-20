import json
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Database, DatabaseRow
from ..schemas import (
    DatabaseCreate, DatabaseUpdate, DatabaseOut,
    DatabaseRowCreate, DatabaseRowUpdate, DatabaseRowOut
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/databases",
    tags=["databases"]
)

DEFAULT_SCHEMA = [
    {
        "id": "col_title",
        "name": "任务名称",
        "type": "title",
        "width": 240
    },
    {
        "id": "col_status",
        "name": "状态",
        "type": "status",
        "width": 130,
        "options": [
            {"id": "todo", "name": "未开始", "color": "gray"},
            {"id": "in_progress", "name": "进行中", "color": "blue"},
            {"id": "done", "name": "已完成", "color": "green"}
        ]
    },
    {
        "id": "col_priority",
        "name": "优先级",
        "type": "select",
        "width": 110,
        "options": [
            {"id": "high", "name": "高", "color": "red"},
            {"id": "medium", "name": "中", "color": "amber"},
            {"id": "low", "name": "低", "color": "slate"}
        ]
    },
    {
        "id": "col_date",
        "name": "截止日期",
        "type": "date",
        "width": 130
    },
    {
        "id": "col_tags",
        "name": "标签",
        "type": "multi_select",
        "width": 150,
        "options": [
            {"id": "frontend", "name": "前端", "color": "purple"},
            {"id": "backend", "name": "后端", "color": "green"},
            {"id": "design", "name": "设计", "color": "pink"}
        ]
    },
    {
        "id": "col_progress",
        "name": "进度",
        "type": "number",
        "format": "percent",
        "width": 120
    }
]

DEFAULT_VIEWS = [
    {
        "id": "view_table_default",
        "name": "表格视图",
        "type": "table",
        "visible_columns": ["col_title", "col_status", "col_priority", "col_date", "col_tags", "col_progress"],
        "sorts": [],
        "filters": []
    },
    {
        "id": "view_kanban_default",
        "name": "看板视图",
        "type": "kanban",
        "group_by": "col_status",
        "visible_columns": ["col_title", "col_priority", "col_date", "col_tags"],
        "sorts": [],
        "filters": []
    }
]

DEFAULT_SAMPLE_ROWS = [
    {
        "properties": {
            "col_title": "设计多维数据表架构与交互原型",
            "col_status": "done",
            "col_priority": "high",
            "col_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "col_tags": ["design", "frontend"],
            "col_progress": 100
        },
        "content": "# 多维数据表设计方案\n\n- 采用属性元数据解耦架构\n- 强化前端 60fps 流畅交互与拖拽",
        "order_index": 1.0
    },
    {
        "properties": {
            "col_title": "实现 FastAPI 后端数据表与数据行 CRUD",
            "col_status": "in_progress",
            "col_priority": "high",
            "col_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "col_tags": ["backend"],
            "col_progress": 70
        },
        "content": "### 后端接口\n\n- `/api/databases` 完整端点已就绪",
        "order_index": 2.0
    },
    {
        "properties": {
            "col_title": "打造 Notion 式看板与行即页面编辑抽屉",
            "col_status": "todo",
            "col_priority": "medium",
            "col_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "col_tags": ["frontend"],
            "col_progress": 0
        },
        "content": "### 待办要点\n\n- 支持泳道快速流转与富文本沉浸式编辑",
        "order_index": 3.0
    }
]


def _serialize_database_out(db_item: Database) -> dict:
    """序列化 Database 对象"""
    schema_list = json.loads(db_item.schema_json or "[]")
    views_list = json.loads(db_item.views_json or "[]")
    
    rows_out = []
    for r in (db_item.rows or []):
        rows_out.append({
            "id": r.id,
            "database_id": r.database_id,
            "properties": json.loads(r.properties_json or "{}"),
            "content": r.content or "",
            "content_json": r.content_json or "",
            "order_index": r.order_index or 0.0,
            "created_at": r.created_at,
            "updated_at": r.updated_at
        })

    return {
        "id": db_item.id,
        "title": db_item.title,
        "icon": db_item.icon or "📊",
        "description": db_item.description or "",
        "schema": schema_list,
        "views": views_list,
        "notebook_id": db_item.notebook_id,
        "rows": rows_out,
        "created_at": db_item.created_at,
        "updated_at": db_item.updated_at
    }


@router.get("", response_model=List[DatabaseOut])
def get_databases(
    notebook_id: Optional[str] = None,
    is_archived: bool = Query(False, description="是否获取已删除/归档的数据表"),
    db: Session = Depends(get_db)
):
    """获取数据表列表 (默认获取活跃表，is_archived=True 时获取废纸篓表)"""
    query = db.query(Database).filter(Database.is_archived == is_archived)
    if notebook_id:
        query = query.filter(Database.notebook_id == notebook_id)
    databases = query.order_by(Database.created_at.asc()).all()
    return [_serialize_database_out(d) for d in databases]



@router.post("", response_model=DatabaseOut, status_code=status.HTTP_201_CREATED)
def create_database(
    db_in: DatabaseCreate,
    create_samples: bool = Query(False, description="是否初始化示例数据行（默认为 False 创建空表）"),
    db: Session = Depends(get_db)
):
    """创建新数据表"""
    schema_data = [col.model_dump() for col in db_in.schema] if db_in.schema is not None else DEFAULT_SCHEMA
    views_data = [v.model_dump() for v in db_in.views] if db_in.views is not None else DEFAULT_VIEWS

    new_db = Database(
        title=db_in.title or "未命名数据表",
        icon=db_in.icon or "📊",
        description=db_in.description or "",
        schema_json=json.dumps(schema_data, ensure_ascii=False),
        views_json=json.dumps(views_data, ensure_ascii=False),
        notebook_id=db_in.notebook_id
    )
    db.add(new_db)
    db.flush()

    if create_samples:
        for sample in DEFAULT_SAMPLE_ROWS:
            row = DatabaseRow(
                database_id=new_db.id,
                properties_json=json.dumps(sample["properties"], ensure_ascii=False),
                content=sample["content"],
                order_index=sample["order_index"]
            )
            db.add(row)

    db.commit()
    db.refresh(new_db)
    return _serialize_database_out(new_db)


@router.get("/{id}", response_model=DatabaseOut)
def get_database(id: str, db: Session = Depends(get_db)):
    """获取单个数据表详情及全部数据行"""
    db_item = db.query(Database).filter(Database.id == id, Database.is_archived == False).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="数据表不存在")
    return _serialize_database_out(db_item)


@router.put("/{id}", response_model=DatabaseOut)
def update_database(id: str, db_in: DatabaseUpdate, db: Session = Depends(get_db)):
    """更新数据表元数据、列定义 (Schema) 或视图配置 (Views)"""
    db_item = db.query(Database).filter(Database.id == id, Database.is_archived == False).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="数据表不存在")

    if db_in.title is not None:
        db_item.title = db_in.title
    if db_in.icon is not None:
        db_item.icon = db_in.icon
    if db_in.description is not None:
        db_item.description = db_in.description
    if db_in.schema is not None:
        schema_data = [col.model_dump() for col in db_in.schema]
        db_item.schema_json = json.dumps(schema_data, ensure_ascii=False)
    if db_in.views is not None:
        views_data = [v.model_dump() for v in db_in.views]
        db_item.views_json = json.dumps(views_data, ensure_ascii=False)
    if db_in.notebook_id is not None:
        db_item.notebook_id = db_in.notebook_id

    db_item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_item)
    return _serialize_database_out(db_item)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_database(id: str, permanent: bool = Query(False), db: Session = Depends(get_db)):
    """删除数据表 (支持软删除与硬删除)"""
    db_item = db.query(Database).filter(Database.id == id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="数据表不存在")

    if permanent:
        db.delete(db_item)
    else:
        db_item.is_archived = True
        db_item.updated_at = datetime.utcnow()
    db.commit()
    return None


@router.post("/{id}/restore", response_model=DatabaseOut)
def restore_database(id: str, db: Session = Depends(get_db)):
    """恢复已删除/归档的数据表"""
    db_item = db.query(Database).filter(Database.id == id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="数据表不存在")
    db_item.is_archived = False
    db_item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_item)
    return _serialize_database_out(db_item)



# ----------------- 数据行 (Rows / Records) 操作 -----------------

@router.post("/{id}/rows", response_model=DatabaseRowOut, status_code=status.HTTP_201_CREATED)
def create_database_row(
    id: str,
    row_in: DatabaseRowCreate,
    db: Session = Depends(get_db)
):
    """向指定数据表中新增一行记录"""
    db_item = db.query(Database).filter(Database.id == id, Database.is_archived == False).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="数据表不存在")

    # 获取当前最大 order_index
    max_order = db.query(DatabaseRow).filter(DatabaseRow.database_id == id).order_by(DatabaseRow.order_index.desc()).first()
    next_order = (max_order.order_index + 1.0) if max_order else 1.0

    new_row = DatabaseRow(
        database_id=id,
        properties_json=json.dumps(row_in.properties or {}, ensure_ascii=False),
        content=row_in.content or "",
        content_json=row_in.content_json or "",
        order_index=row_in.order_index if row_in.order_index is not None else next_order
    )
    db.add(new_row)
    db.commit()
    db.refresh(new_row)

    return {
        "id": new_row.id,
        "database_id": new_row.database_id,
        "properties": json.loads(new_row.properties_json or "{}"),
        "content": new_row.content or "",
        "content_json": new_row.content_json or "",
        "order_index": new_row.order_index,
        "created_at": new_row.created_at,
        "updated_at": new_row.updated_at
    }


@router.put("/{id}/rows/{row_id}", response_model=DatabaseRowOut)
def update_database_row(
    id: str,
    row_id: str,
    row_in: DatabaseRowUpdate,
    db: Session = Depends(get_db)
):
    """更新单行记录的属性或正文"""
    row = db.query(DatabaseRow).filter(DatabaseRow.id == row_id, DatabaseRow.database_id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="记录行不存在")

    if row_in.properties is not None:
        # 合并更新 properties
        current_props = json.loads(row.properties_json or "{}")
        current_props.update(row_in.properties)
        row.properties_json = json.dumps(current_props, ensure_ascii=False)
    if row_in.content is not None:
        row.content = row_in.content
    if row_in.content_json is not None:
        row.content_json = row_in.content_json
    if row_in.order_index is not None:
        row.order_index = row_in.order_index

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "database_id": row.database_id,
        "properties": json.loads(row.properties_json or "{}"),
        "content": row.content or "",
        "content_json": row.content_json or "",
        "order_index": row.order_index,
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }


@router.delete("/{id}/rows/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_database_row(id: str, row_id: str, db: Session = Depends(get_db)):
    """删除单行记录"""
    row = db.query(DatabaseRow).filter(DatabaseRow.id == row_id, DatabaseRow.database_id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="记录行不存在")
    db.delete(row)
    db.commit()
    return None
