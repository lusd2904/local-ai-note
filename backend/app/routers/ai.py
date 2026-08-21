import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AISetting
from ..schemas import AIAnalyzeRequest, AIChatRequest, AISettingUpdate, AISettingOut
from ..services.ai_service import AIService, get_ai_config, get_openai_client

router = APIRouter(prefix="/api/ai", tags=["AI Copilot & Settings"])

@router.post("/analyze")
async def analyze_content(data: AIAnalyzeRequest, db: Session = Depends(get_db)):
    """非流式快捷算子（兼容旧接口）"""
    result = await AIService.analyze_note(
        content=data.content,
        action=data.action,
        target_lang=data.target_lang or "English",
        db=db
    )
    return {"status": "success", "action": data.action, "result": result}

@router.post("/analyze/stream")
async def analyze_content_stream(data: AIAnalyzeRequest, db: Session = Depends(get_db)):
    """流式执行 AI 快捷算子 (SSE Server-Sent Events 打字机输出)"""
    async def event_generator():
        try:
            async for chunk in AIService.analyze_note_stream(
                content=data.content,
                action=data.action,
                target_lang=data.target_lang or "English",
                db=db
            ):
                payload = json.dumps({"chunk": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
            yield f"data: {json.dumps({'chunk': '', 'done': True})}\n\n"
        except Exception as e:
            err_payload = json.dumps({"error": str(e), "done": True}, ensure_ascii=False)
            yield f"data: {err_payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/chat")
async def chat_with_note(data: AIChatRequest, db: Session = Depends(get_db)):
    """非流式问答（兼容旧接口）"""
    messages_payload = [{"role": m.role, "content": m.content} for m in data.messages]
    note_ctx = f"标题: {data.note_title}\n内容:\n{data.note_content}" if data.note_content else ""
    
    reply = await AIService.chat_with_note(
        messages=messages_payload,
        note_context=note_ctx,
        audio_context=data.audio_transcript or "",
        db=db
    )
    return {"status": "success", "reply": reply}

@router.post("/chat/stream")
async def chat_with_note_stream(data: AIChatRequest, db: Session = Depends(get_db)):
    """流式智能问答 (SSE Server-Sent Events)"""
    messages_payload = [{"role": m.role, "content": m.content} for m in data.messages]
    note_ctx = f"标题: {data.note_title}\n内容:\n{data.note_content}" if data.note_content else ""

    async def event_generator():
        try:
            async for chunk in AIService.chat_with_note_stream(
                messages=messages_payload,
                note_context=note_ctx,
                audio_context=data.audio_transcript or "",
                db=db
            ):
                payload = json.dumps({"chunk": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
            yield f"data: {json.dumps({'chunk': '', 'done': True})}\n\n"
        except Exception as e:
            err_payload = json.dumps({"error": str(e), "done": True}, ensure_ascii=False)
            yield f"data: {err_payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

DEFAULT_PROVIDERS_CONFIG = {
    "claude": {
        "provider": "claude",
        "name": "Claude / Code",
        "base_url": "https://api.anthropic.com/v1",
        "api_key": "",
        "model_name": "claude-3-7-sonnet-20250219",
        "reasoning_effort": "medium",
        "temperature": 0.7
    },
    "grok": {
        "provider": "grok",
        "name": "Grok",
        "base_url": "https://api.x.ai/v1",
        "api_key": "",
        "model_name": "grok-3",
        "reasoning_effort": "medium",
        "temperature": 0.7
    },
    "ollama": {
        "provider": "ollama",
        "name": "本地离线 Ollama",
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",
        "model_name": "qwen2.5:7b",
        "reasoning_effort": "disabled",
        "temperature": 0.7
    }
}


def _is_placeholder_key(key) -> bool:
    if key is None:
        return True
    text = str(key).strip()
    if text == "":
        return True
    if text == "***" or "..." in text:
        return True
    return False

@router.get("/settings", response_model=AISettingOut)
def get_ai_settings(db: Session = Depends(get_db)):
    """获取当前的 AI 配置（支持多渠道独立配置、推理强度与默认生效渠道回显）"""
    setting = db.query(AISetting).filter(AISetting.id == "default").first()
    if not setting:
        setting = AISetting(id="default")
        db.add(setting)
        db.commit()
        db.refresh(setting)

    # 1. 解析多渠道配置字典
    saved_providers = {}
    try:
        saved_providers = json.loads(setting.providers_config) if setting.providers_config else {}
    except Exception:
        saved_providers = {}

    merged_providers = json.loads(json.dumps(DEFAULT_PROVIDERS_CONFIG))
    for k, v in saved_providers.items():
        if k in merged_providers and isinstance(v, dict):
            merged_providers[k].update(v)
        elif k not in ("openai", "deepseek") and isinstance(v, dict):
            merged_providers[k] = v

    grok_src = saved_providers.get("grok") if isinstance(saved_providers.get("grok"), dict) else None
    if not grok_src or not grok_src.get("api_key"):
        legacy = saved_providers.get("openai") if isinstance(saved_providers.get("openai"), dict) else None
        if not legacy:
            legacy = saved_providers.get("deepseek") if isinstance(saved_providers.get("deepseek"), dict) else None
        if legacy:
            merged_providers["grok"].update({k: v for k, v in legacy.items() if k not in ("provider", "name")})
            merged_providers["grok"]["provider"] = "grok"
            merged_providers["grok"]["name"] = "Grok"

    active_prov = setting.active_provider or setting.provider or "claude"
    if active_prov in ("openai", "deepseek"):
        active_prov = "grok"
    active_cfg = merged_providers.get(active_prov, merged_providers["claude"])

    masked_key = ""
    cur_key = active_cfg.get("api_key") or setting.api_key or ""
    if cur_key:
        if len(cur_key) > 8:
            masked_key = cur_key[:3] + "..." + cur_key[-4:]
        else:
            masked_key = "***"

    # 安全处理：遮蔽所有渠道的 API Key，避免完整密钥暴露给前端
    safe_providers = {}
    for prov_key, prov_cfg in merged_providers.items():
        safe_cfg = prov_cfg.copy()
        key = safe_cfg.get("api_key", "")
        if key:
            if len(key) > 8:
                safe_cfg["api_key_masked"] = key[:3] + "..." + key[-4:]
            else:
                safe_cfg["api_key_masked"] = "***"
            safe_cfg["api_key_configured"] = True
            del safe_cfg["api_key"]  # 移除完整密钥
        else:
            safe_cfg["api_key_masked"] = ""
            safe_cfg["api_key_configured"] = False
        safe_cfg.pop("models", None)
        safe_providers[prov_key] = safe_cfg

    return {
        "active_provider": active_prov,
        "providers_config": safe_providers,
        "provider": active_prov,
        "api_key": "",  # 不返回完整密钥
        "api_key_masked": masked_key,
        "api_key_configured": bool(cur_key),  # 仅返回是否已配置
        "base_url": active_cfg.get("base_url") or setting.base_url or "https://api.anthropic.com/v1",
        "model_name": active_cfg.get("model_name") or setting.model_name or "claude-3-7-sonnet-20250219",
        "reasoning_effort": active_cfg.get("reasoning_effort") or setting.reasoning_effort or "medium",
        "whisper_model": setting.whisper_model or "whisper-1",
        "temperature": active_cfg.get("temperature", 0.7)
    }

@router.post("/settings")
def update_ai_settings(data: AISettingUpdate, db: Session = Depends(get_db)):
    """更新 AI 配置（完整持久化 provider, reasoning_effort, api_key 等）"""
    setting = db.query(AISetting).filter(AISetting.id == "default").first()
    if not setting:
        setting = AISetting(id="default")
        db.add(setting)

    # 1. 更新多渠道配置字典
    current_providers = {}
    try:
        current_providers = json.loads(setting.providers_config) if setting.providers_config else {}
    except Exception:
        current_providers = {}

    if data.providers_config:
        for k, v in data.providers_config.items():
            if not isinstance(v, dict):
                continue
            incoming = dict(v)
            incoming.pop("api_key_masked", None)
            incoming.pop("api_key_configured", None)
            incoming.pop("models", None)
            old = current_providers.get(k) if isinstance(current_providers.get(k), dict) else {}
            if _is_placeholder_key(incoming.get("api_key")):
                if old.get("api_key"):
                    incoming["api_key"] = old["api_key"]
                else:
                    incoming.pop("api_key", None)
            current_providers[k] = {**old, **incoming}
        setting.providers_config = json.dumps(current_providers, ensure_ascii=False)

    # 2. 更新当前默认激活渠道
    active_p = data.active_provider or data.provider
    if active_p in ("openai", "deepseek"):
        active_p = "grok"
    if active_p:
        setting.active_provider = active_p
        setting.provider = active_p

        if active_p in current_providers:
            p_info = current_providers[active_p]
            setting.base_url = p_info.get("base_url", setting.base_url)
            if not _is_placeholder_key(p_info.get("api_key")):
                setting.api_key = p_info.get("api_key", setting.api_key)
            setting.model_name = p_info.get("model_name", setting.model_name)
            setting.reasoning_effort = p_info.get("reasoning_effort", setting.reasoning_effort)
            setting.temperature = p_info.get("temperature", setting.temperature)

    if data.api_key is not None and not _is_placeholder_key(data.api_key):
        setting.api_key = data.api_key
        if active_p in current_providers:
            current_providers[active_p]["api_key"] = data.api_key
    if data.base_url is not None:
        setting.base_url = data.base_url
        if active_p in current_providers: current_providers[active_p]["base_url"] = data.base_url
    if data.model_name is not None:
        setting.model_name = data.model_name
        if active_p in current_providers: current_providers[active_p]["model_name"] = data.model_name
    if data.reasoning_effort is not None:
        setting.reasoning_effort = data.reasoning_effort
        if active_p in current_providers: current_providers[active_p]["reasoning_effort"] = data.reasoning_effort
    if data.whisper_model is not None:
        setting.whisper_model = data.whisper_model
    if data.temperature is not None:
        setting.temperature = data.temperature
        if active_p in current_providers: current_providers[active_p]["temperature"] = data.temperature

    setting.providers_config = json.dumps(current_providers, ensure_ascii=False)
    db.commit()
    db.refresh(setting)
    return {"status": "success", "message": "AI settings updated successfully"}
