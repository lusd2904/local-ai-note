import os
import uuid
import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException
from ..config import IMAGES_DIR

router = APIRouter(prefix="/api/upload", tags=["Uploads"])

@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    """接收剪贴板粘贴或拖拽上传的图片，保存至本地 ./data/uploads/images/"""
    filename = file.filename or "uploaded_image.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]:
        ext = ".png"

    unique_filename = f"{uuid.uuid4()}{ext}"
    dest_path = IMAGES_DIR / unique_filename

    try:
        async with aiofiles.open(dest_path, "wb") as out_file:
            while content := await file.read(1024 * 1024):
                await out_file.write(content)
        
        url = f"/api/uploads/images/{unique_filename}"
        return {
            "status": "success",
            "url": url,
            "filename": unique_filename,
            "original_name": filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
