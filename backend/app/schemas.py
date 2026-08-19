from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

# ----------------- 笔记本 (Notebook) -----------------
class NotebookBase(BaseModel):
    name: str
    parent_id: Optional[str] = None
    color: Optional[str] = "#3B82F6"
    icon: Optional[str] = "BookOpen"
    sort_order: Optional[int] = 0

class NotebookCreate(NotebookBase):
    pass

class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None

class NotebookOut(NotebookBase):
    id: str
    created_at: datetime
    updated_at: datetime
    note_count: Optional[int] = 0

    class Config:
        from_attributes = True

class NotebookTreeOut(NotebookOut):
    children: List["NotebookTreeOut"] = []

# ----------------- 笔记 (Note) -----------------
class NoteBase(BaseModel):
    title: str = "无标题笔记"
    content: Optional[str] = ""
    content_json: Optional[str] = ""
    notebook_id: Optional[str] = None
    summary: Optional[str] = ""
    tags: Optional[List[str]] = []
    is_starred: Optional[bool] = False
    is_trashed: Optional[bool] = False
    is_locked: Optional[bool] = False

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[str] = None
    notebook_id: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = None
    is_starred: Optional[bool] = None
    is_trashed: Optional[bool] = None
    is_locked: Optional[bool] = None

class NoteOut(NoteBase):
    id: str
    created_at: datetime
    updated_at: datetime
    audio_count: Optional[int] = 0

    class Config:
        from_attributes = True

class NoteLockRequest(BaseModel):
    password: str

class NoteUnlockRequest(BaseModel):
    password: str

class NoteVerifyPasswordRequest(BaseModel):
    password: str

# ----------------- 录音记录 (AudioRecord) -----------------
class AudioRecordOut(BaseModel):
    id: str
    note_id: Optional[str] = None
    file_name: str
    file_path: str
    file_url: Optional[str] = None
    file_size: int
    duration: float
    mime_type: str
    transcription: str
    transcription_segments: Optional[Any] = []
    ai_summary: str
    action_items: Optional[Any] = []
    status: str
    error_msg: Optional[str] = ""
    created_at: datetime

    class Config:
        from_attributes = True

# ----------------- AI 相关请求/响应 -----------------
class AIAnalyzeRequest(BaseModel):
    note_id: Optional[str] = None
    content: str
    action: str  # "summary", "polish", "expand", "translate", "mindmap", "extract_tags"
    target_lang: Optional[str] = "English"

class AIChatMessage(BaseModel):
    role: str  # "user", "assistant", "system"
    content: str

class AIChatRequest(BaseModel):
    note_id: Optional[str] = None
    note_title: Optional[str] = ""
    note_content: Optional[str] = ""
    audio_transcript: Optional[str] = ""
    messages: List[AIChatMessage]

class AISettingUpdate(BaseModel):
    active_provider: Optional[str] = None
    providers_config: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    reasoning_effort: Optional[str] = None
    whisper_model: Optional[str] = None
    temperature: Optional[float] = None

class AISettingOut(BaseModel):
    active_provider: Optional[str] = "claude"
    providers_config: Optional[Dict[str, Any]] = {}
    provider: Optional[str] = "claude"
    api_key: Optional[str] = ""
    api_key_masked: Optional[str] = ""
    base_url: str
    model_name: str
    reasoning_effort: Optional[str] = "medium"
    whisper_model: str
    temperature: float

    class Config:
        from_attributes = True


