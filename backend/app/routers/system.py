import io
import tarfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ..config import DATA_DIR

router = APIRouter(prefix="/api/system", tags=["system"])


def _safe_extract(tar: tarfile.TarFile, dest: Path):
    dest = dest.resolve()
    for member in tar.getmembers():
        member_path = (dest / member.name).resolve()
        if dest != member_path and dest not in member_path.parents:
            raise HTTPException(status_code=400, detail="备份包包含非法路径")
    tar.extractall(dest)


@router.post("/backup")
def create_backup():
    """打包 data 目录（笔记库、录音、图片）并直接下载。"""
    if not DATA_DIR.exists():
        raise HTTPException(status_code=404, detail="数据目录不存在")

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        tar.add(str(DATA_DIR), arcname="data")
    buffer.seek(0)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"note_backup_{stamp}.tar.gz"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="application/gzip", headers=headers)


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """从 tar.gz 备份恢复 data 目录（覆盖现有数据）。"""
    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="请上传 .tar.gz 备份文件")

    content = await file.read()
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="备份文件过大")

    try:
        buffer = io.BytesIO(content)
        with tarfile.open(fileobj=buffer, mode="r:gz") as tar:
            names = tar.getnames()
            if not any(n == "data" or n.startswith("data/") for n in names):
                raise HTTPException(status_code=400, detail="备份包中没有 data 目录")
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            parent = DATA_DIR.parent
            _safe_extract(tar, parent)
    except HTTPException:
        raise
    except tarfile.TarError:
        raise HTTPException(status_code=400, detail="无法解析备份文件")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"恢复失败: {exc}")

    return {"status": "ok", "message": "数据已恢复，建议刷新页面。"}
