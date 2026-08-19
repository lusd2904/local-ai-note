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


# ----------------- 局域网配对与多端双向同步 (Sync) -----------------
class SyncInfoOut(BaseModel):
    server_ip: str
    port: int
    device_name: str
    pairing_code: str
    token: str
    qr_data: str

class SyncPairRequest(BaseModel):
    device_id: str
    device_name: str
    pairing_code: str

class SyncPairOut(BaseModel):
    status: str
    token: str
    server_name: str
    server_time: datetime

class SyncItemDict(BaseModel):
    pass

class SyncPullRequest(BaseModel):
    last_sync_time: Optional[datetime] = None
    token: Optional[str] = None

class SyncPullOut(BaseModel):
    notebooks: List[Dict[str, Any]] = []
    notes: List[Dict[str, Any]] = []
    audio_records: List[Dict[str, Any]] = []
    deleted_note_ids: List[str] = []
    deleted_notebook_ids: List[str] = []
    sync_timestamp: datetime

class SyncPushRequest(BaseModel):
    notebooks: List[Dict[str, Any]] = []
    notes: List[Dict[str, Any]] = []
    audio_records: List[Dict[str, Any]] = []
    deleted_note_ids: List[str] = []
    deleted_notebook_ids: List[str] = []
    token: Optional[str] = None

class SyncPushOut(BaseModel):
    status: str
    inserted_notes: int
    updated_notes: int
    inserted_notebooks: int
    updated_notebooks: int
    sync_timestamp: datetime

class SyncTwoWayRequest(BaseModel):
    last_sync_time: Optional[datetime] = None
    notebooks: List[Dict[str, Any]] = []
    notes: List[Dict[str, Any]] = []
    audio_records: List[Dict[str, Any]] = []
    deleted_note_ids: List[str] = []
    deleted_notebook_ids: List[str] = []
    token: Optional[str] = None

class SyncTwoWayOut(BaseModel):
    status: str
    server_notebooks: List[Dict[str, Any]] = []
    server_notes: List[Dict[str, Any]] = []
    server_audio_records: List[Dict[str, Any]] = []
    server_deleted_note_ids: List[str] = []
    server_deleted_notebook_ids: List[str] = []
    sync_timestamp: datetime
    stats: Dict[str, Any] = {}


