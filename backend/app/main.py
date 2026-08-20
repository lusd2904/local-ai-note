import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .config import settings, UPLOAD_DIR, AUDIO_DIR, IMAGES_DIR
from .database import engine, Base, SessionLocal
from .models import Notebook, Note, AISetting
from .routers import notebooks, notes, audio, ai, upload, sync, memos, databases

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建数据库表
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Local AI Note API",
    description="macOS 本地私有 AI 智能笔记与语音分析系统",
    version=settings.VERSION
)

# CORS 跨域配置（M3: 限制为本地与局域网移动端前端访问）
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载本地上传的静态音频与图片文件
app.mount("/api/uploads/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio_files")
app.mount("/api/uploads/images", StaticFiles(directory=str(IMAGES_DIR)), name="image_files")

# 注册路由
app.include_router(notebooks.router)
app.include_router(notes.router)
app.include_router(databases.router)
app.include_router(memos.router)
app.include_router(audio.router)
app.include_router(ai.router)
app.include_router(upload.router)
app.include_router(sync.router)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """初始化默认笔记本、AI 设置与示例欢迎笔记"""
    db = SessionLocal()
    try:
        # 1. 初始化 AI 设置
        if not db.query(AISetting).filter(AISetting.id == "default").first():
            db.add(AISetting(
                id="default",
                api_key=settings.AI_API_KEY,
                base_url=settings.AI_BASE_URL,
                model_name=settings.AI_MODEL,
                temperature=0.7
            ))
            db.commit()

        # 2. 检查是否有笔记本，若无则创建默认笔记本
        if db.query(Notebook).count() == 0:
            nb1 = Notebook(name="工作与项目", color="#3B82F6", icon="Briefcase", sort_order=1)
            nb2 = Notebook(name="学习心得", color="#10B981", icon="BookOpen", sort_order=2)
            nb3 = Notebook(name="日常速记", color="#F59E0B", icon="Zap", sort_order=3)
            db.add_all([nb1, nb2, nb3])
            db.commit()
            db.refresh(nb1)

            # 3. 创建一篇富有表现力的欢迎笔记
            welcome_content = """# 欢迎使用 macOS 本地私有 AI 智能笔记系统 🚀

> 🔒 **100% 物理留存本地**：所有的笔记、录音音频、AI 分析产物均保存在您的本地磁盘 (`./data/`)，零云端上传，免除一切隐私泄露风险。

---

## 🌟 核心特色功能一览

### 1. 类似有道云笔记的经典编辑与组织
- **多级笔记本树**：在左侧随时新建、重命名、拖拽分类。
- **富文本与 Markdown 双向支持**：支持标题、粗体、高亮、有序/无序列表、待办任务清单、代码块等。
- **截图即存本地**：按下 `Cmd + Shift + 4` 截图后，直接在编辑器中 `Cmd + V` 粘贴，图片会自动保存在本地磁盘。

### 2. 🎙️ 语音录音工坊 (Audio-to-Note)
- **支持常见音频拖拽上传**（`.mp3`, `.m4a`, `.wav`, `.aac` 等）或直接在浏览器端**点击麦克风实时录音**。
- **波形可视化播放**：直观查看声波曲线，支持倍速播放与逐字稿联动。
- **AI 智能提取**：一键生成带时间戳的逐字稿、**核心结论**与**行动项待办清单 (Action Items)**，并可一键转入正式笔记！

### 3. 🧠 AI 智能副驾驶 (Note Copilot)
- 点击右上角 **「AI 助手」** 展开侧边栏：
  - 💬 **Chat with Note**：就当前这篇笔记或录音逐字稿向 AI 自由提问。
  - ✨ **一键快捷算子**：智能摘要、文字润色、结构扩写、多语言互译。
  - 🧠 **一键生成思维导图**：自动提炼要点并渲染为 Mermaid 脑图。

---

## 💡 快捷使用小贴士
1. 点击左下角 **「设置」**，您可以填入自己的 OpenAI / DeepSeek API Key，或者填入 `http://localhost:11434/v1` 连接本地 **Ollama** 离线大模型！
2. 试着点击左侧导航栏的 **「🎙️ 语音工坊」**，上传一段录音体验全自动会议纪要提炼吧！
"""
            welcome_note = Note(
                notebook_id=nb1.id,
                title="欢迎使用 macOS 本地私有 AI 智能笔记系统 🚀",
                content=welcome_content,
                summary="macOS 本地私有 AI 智能笔记系统功能全景指南，包括类有道云层级管理、语音录音工坊与 AI Copilot 助手。",
                tags=json.dumps(["快速上手", "指南", "AI笔记"], ensure_ascii=False),
                is_starred=True
            )
            db.add(welcome_note)
            db.commit()
            logger.info("Initialized default notebooks and welcome note.")
    finally:
        db.close()
    yield

app.router.lifespan_context = lifespan

@app.get("/")
def root():
    return {"status": "running", "service": "Local AI Note API", "version": settings.VERSION}
