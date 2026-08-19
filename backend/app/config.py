import os
from pathlib import Path
from pydantic_settings import BaseSettings

# 基础路径
BASE_DIR = Path(__file__).resolve().parent.parent
# 优先从环境变量 DATA_DIR 读取，默认为挂载目录 /app/data，若不存在则使用项目相对目录 ./data
env_data_dir = os.getenv("DATA_DIR")
if env_data_dir:
    DATA_DIR = Path(env_data_dir)
elif Path("/app/data").exists():
    DATA_DIR = Path("/app/data")
else:
    DATA_DIR = Path(str(BASE_DIR.parent / "data"))

UPLOAD_DIR = DATA_DIR / "uploads"
AUDIO_DIR = UPLOAD_DIR / "audio"
IMAGES_DIR = UPLOAD_DIR / "images"
EXPORTS_DIR = UPLOAD_DIR / "exports"

# 确保目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Local AI Note"
    VERSION: str = "1.0.0"
    DATABASE_URL: str = f"sqlite:///{DATA_DIR / 'notes.db'}"
    
    # 默认 AI 配置 (用户也可以在前端设置面板中自由动态修改保存)
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.anthropic.com/v1")
    AI_MODEL: str = os.getenv("AI_MODEL", "claude-3-7-sonnet-20250219")
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
