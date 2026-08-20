import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    parent_id = Column(String(36), ForeignKey("notebooks.id"), nullable=True)
    color = Column(String(20), default="#3B82F6")
    icon = Column(String(50), default="BookOpen")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    notes = relationship("Note", back_populates="notebook", cascade="all, delete-orphan")
    children = relationship("Notebook", backref="parent", remote_side=[id])

class Note(Base):
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    notebook_id = Column(String(36), ForeignKey("notebooks.id"), nullable=True)
    title = Column(String(200), default="无标题笔记")
    content = Column(Text, default="")
    content_json = Column(Text, default="")
    summary = Column(Text, default="")
    tags = Column(Text, default="[]")  # JSON 格式存标签列表
    is_starred = Column(Boolean, default=False)
    is_trashed = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    password_hash = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    notebook = relationship("Notebook", back_populates="notes")
    audio_records = relationship("AudioRecord", back_populates="note", cascade="all, delete-orphan")

class AudioRecord(Base):
    __tablename__ = "audio_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    note_id = Column(String(36), ForeignKey("notes.id"), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)
    duration = Column(Float, default=0.0)
    mime_type = Column(String(50), default="audio/mpeg")
    
    # 转录与 AI 产物
    transcription = Column(Text, default="")
    transcription_segments = Column(Text, default="[]")  # JSON array: [{start: 0, end: 5, text: "..."}]
    ai_summary = Column(Text, default="")                # AI 结构化会议纪要
    action_items = Column(Text, default="[]")            # 待办清单 JSON array
    status = Column(String(30), default="completed")     # uploading, transcribing, analyzing, completed, error
    error_msg = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    note = relationship("Note", back_populates="audio_records")

class AISetting(Base):
    __tablename__ = "ai_settings"

    id = Column(String(36), primary_key=True, default="default")
    active_provider = Column(String(50), default="claude")  # 当前默认生效的渠道: claude, deepseek, openai, ollama, custom
    providers_config = Column(Text, default="{}")           # JSON: 保存所有渠道各自独立的 api_key, base_url, model_name
    provider = Column(String(50), default="claude")
    api_key = Column(String(255), default="")
    base_url = Column(String(255), default="https://api.anthropic.com/v1")
    model_name = Column(String(100), default="claude-3-7-sonnet-20250219")
    reasoning_effort = Column(String(50), default="medium") # disabled, low, medium, high
    whisper_model = Column(String(100), default="whisper-1")
    temperature = Column(Float, default=0.7)
    custom_prompts = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Memo(Base):
    """闪念速记模型 (轻量碎片灵感流，类似 flomo / Memos)"""
    __tablename__ = "memos"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    content = Column(Text, nullable=False, default="")
    images = Column(Text, default="[]")       # JSON array: 图片 URL 列表
    tags = Column(Text, default="[]")         # JSON array: 标签列表
    is_pinned = Column(Boolean, default=False)# 是否置顶
    is_archived = Column(Boolean, default=False) # 是否已归档/转入笔记
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Database(Base):
    """Notion 式多维数据库表模型"""
    __tablename__ = "databases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False, default="未命名数据表")
    icon = Column(String(50), default="📊")
    description = Column(Text, default="")
    schema_json = Column(Text, default="[]")  # JSON: 列定义数组
    views_json = Column(Text, default="[]")   # JSON: 视图定义数组 (表格、看板等)
    notebook_id = Column(String(36), ForeignKey("notebooks.id"), nullable=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联该数据库的所有行
    rows = relationship("DatabaseRow", back_populates="database", cascade="all, delete-orphan", order_by="DatabaseRow.order_index")


class DatabaseRow(Base):
    """数据库行记录 (每行即一篇独立笔记页面)"""
    __tablename__ = "database_rows"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    database_id = Column(String(36), ForeignKey("databases.id", ondelete="CASCADE"), nullable=False)
    properties_json = Column(Text, default="{}") # JSON: 每列的值 { col_id: value }
    content = Column(Text, default="")           # 该行展开后的富文本 Markdown 正文
    content_json = Column(Text, default="")      # Tiptap JSON 格式
    order_index = Column(Float, default=0.0)     # 排序权重
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    database = relationship("Database", back_populates="rows")


