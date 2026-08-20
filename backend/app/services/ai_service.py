import json
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from ..models import AISetting
from ..config import settings

logger = logging.getLogger(__name__)

def get_ai_config(db: Session) -> Dict[str, Any]:
    """获取用户当前默认生效的 AI 渠道与模型配置"""
    ai_setting = db.query(AISetting).filter(AISetting.id == "default").first()
    if ai_setting:
        active_p = ai_setting.active_provider or ai_setting.provider or "claude"
        
        # 尝试从多渠道字典中读取
        if ai_setting.providers_config:
            try:
                p_map = json.loads(ai_setting.providers_config)
                if active_p in p_map and isinstance(p_map[active_p], dict):
                    cfg = p_map[active_p]
                    return {
                        "provider": active_p,
                        "api_key": cfg.get("api_key") or ("ollama" if active_p == "ollama" else ""),
                        "base_url": cfg.get("base_url") or ("https://api.anthropic.com/v1" if active_p == "claude" else "https://api.openai.com/v1"),
                        "model_name": cfg.get("model_name") or ("claude-3-7-sonnet-20250219" if active_p == "claude" else "gpt-4o"),
                        "reasoning_effort": cfg.get("reasoning_effort") or ai_setting.reasoning_effort or "medium",
                        "whisper_model": ai_setting.whisper_model or "whisper-1",
                        "temperature": cfg.get("temperature", 0.7)
                    }
            except Exception:
                pass

        # 回退到单字段
        return {
            "provider": active_p,
            "api_key": ai_setting.api_key or ("ollama" if active_p == "ollama" else ""),
            "base_url": ai_setting.base_url or "https://api.anthropic.com/v1",
            "model_name": ai_setting.model_name or "claude-3-7-sonnet-20250219",
            "reasoning_effort": ai_setting.reasoning_effort or "medium",
            "whisper_model": ai_setting.whisper_model or "whisper-1",
            "temperature": ai_setting.temperature if ai_setting.temperature is not None else 0.7
        }

    return {
        "provider": "claude",
        "api_key": settings.AI_API_KEY,
        "base_url": settings.AI_BASE_URL,
        "model_name": settings.AI_MODEL,
        "reasoning_effort": "medium",
        "whisper_model": "whisper-1",
        "temperature": 0.7
    }

def get_openai_client(config: Dict[str, Any]) -> AsyncOpenAI:
    """获取标准 OpenAI 兼容客户端"""
    api_key = config.get("api_key") or "dummy-key-for-local-ollama"
    base_url = config.get("base_url") or "https://api.openai.com/v1"
    # 自动对第三方 OpenAI 兼容代理（缺少 /v1）进行安全补齐
    if base_url and not base_url.endswith("/v1") and "anthropic" not in base_url and "api.deepseek.com" not in base_url:
        base_url = base_url.rstrip("/") + "/v1"
    return AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=120.0)


async def call_claude_native_stream(
    api_key: str, 
    base_url: str, 
    model_name: str, 
    messages: List[Dict[str, str]], 
    system_prompt: str = "", 
    temperature: float = 0.7,
    reasoning_effort: str = "medium"
) -> AsyncGenerator[str, None]:
    """通过 Anthropic 原生 SSE 流式传输调用 Claude，支持 Extended Thinking 深度思考"""
    url = base_url.rstrip("/")
    if not url.endswith("/messages"):
        url = f"{url}/v1/messages" if not url.endswith("/v1") else f"{url}/messages"

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    claude_msgs = []
    for m in messages:
        if m["role"] in ["user", "assistant"]:
            claude_msgs.append({"role": m["role"], "content": m["content"]})

    # 推理预算映射 (Claude 3.7 Extended Thinking)
    budget_map = {
        "low": 1024,
        "medium": 2048,
        "high": 4096
    }

    payload = {
        "model": model_name,
        "max_tokens": 8192,
        "messages": claude_msgs,
        "stream": True
    }

    # 如果开启了推理且模型支持
    if reasoning_effort != "disabled" and reasoning_effort in budget_map:
        payload["thinking"] = {
            "type": "enabled",
            "budget_tokens": budget_map[reasoning_effort]
        }
        # 当开启 extended thinking 时，temperature 必须为 1.0 (Anthropic 规范)
        payload["temperature"] = 1.0
    else:
        payload["temperature"] = temperature

    if system_prompt:
        payload["system"] = system_prompt

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            if response.status_code != 200:
                err_text = await response.aread()
                yield f"[AI 错误: {response.status_code}] {err_text.decode('utf-8', errors='ignore')}"
                return

            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    event_data = json.loads(data_str)
                    e_type = event_data.get("type")
                    if e_type == "content_block_delta":
                        delta = event_data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            yield delta.get("text", "")
                        elif delta.get("type") == "thinking_delta":
                            # 深度思考过程 token，以特殊流式形式呈现或直接输出
                            yield delta.get("thinking", "")
                except Exception:
                    continue

async def call_llm_stream(
    messages: List[Dict[str, str]], 
    system_prompt: str = "", 
    config: Dict[str, Any] = None
) -> AsyncGenerator[str, None]:
    """统一流式大模型调度器：自动分发 SSE 流式响应"""
    base_url = config.get("base_url", "").lower()
    api_key = config.get("api_key", "")
    model_name = config.get("model_name", "")
    temperature = config.get("temperature", 0.7)
    reasoning_effort = config.get("reasoning_effort", "medium")

    # 判定是否使用 Claude 原生协议
    is_claude_native = "anthropic.com" in base_url or ("claude" in model_name.lower() and "openai" not in base_url and "localhost" not in base_url)

    if is_claude_native and api_key:
        async for chunk in call_claude_native_stream(
            api_key=api_key,
            base_url=config.get("base_url", "https://api.anthropic.com/v1"),
            model_name=model_name,
            messages=messages,
            system_prompt=system_prompt,
            temperature=temperature,
            reasoning_effort=reasoning_effort
        ):
            yield chunk
        return

    # OpenAI / DeepSeek / Ollama 兼容客户端流式
    client = get_openai_client(config)
    
    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    create_kwargs = {
        "model": model_name,
        "messages": full_messages,
        "stream": True,
        "temperature": temperature
    }

    # 支持 OpenAI o1/o3-mini 或 DeepSeek R1 推理参数
    if reasoning_effort != "disabled" and any(r_model in model_name.lower() for r_model in ["o1", "o3", "reasoner", "r1"]):
        if "o1" in model_name.lower() or "o3" in model_name.lower():
            create_kwargs["reasoning_effort"] = reasoning_effort

    try:
        response = await client.chat.completions.create(**create_kwargs)
        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                # 提取常规文本
                if hasattr(delta, "content") and delta.content:
                    yield delta.content
                # 提取 DeepSeek R1 reasoning_content 思考过程
                elif hasattr(delta, "reasoning_content") and delta.reasoning_content:
                    yield delta.reasoning_content
    except Exception as e:
        logger.error(f"Stream LLM error: {e}")
        yield f"\n[AI 发生错误: {str(e)}]"

async def call_llm(messages: List[Dict[str, str]], system_prompt: str = "", config: Dict[str, Any] = None) -> str:
    """非流式回退调度器"""
    chunks = []
    async for chunk in call_llm_stream(messages=messages, system_prompt=system_prompt, config=config):
        chunks.append(chunk)
    return "".join(chunks)

class AIService:

    @staticmethod
    def get_prompt_for_action(action: str, content: str, target_lang: str = "English") -> str:
        prompts = {
            "summary": (
                "你是一个专业的高效知识总结专家。请对以下笔记内容进行精炼总结，"
                "输出：1. 一句话核心梗概；2. 3~5个关键重点提炼（使用清晰的 Markdown 列表呈现）。\n\n笔记内容：\n" + content
            ),
            "polish": (
                "你是一个资深文字编辑。请对以下笔记内容进行润色与优化，"
                "纠正错别字、改善语病、优化段落结构并提升专业感，同时保持原文的核心原意。请直接输出润色后的内容：\n\n原文：\n" + content
            ),
            "polish_formal": (
                "你是一个资深文字编辑。请对以下笔记内容进行商务正式风格润色，"
                "使其适合职场报告与正式邮件，同时保持原文的核心原意。请直接输出润色后的内容：\n\n原文：\n" + content
            ),
            "polish_concise": (
                "你是一个资深文字编辑。请对以下笔记内容进行极简精炼风格润色，"
                "去除废话赘述，言简意赅，同时保持原文的核心原意。请直接输出润色后的内容：\n\n原文：\n" + content
            ),
            "polish_casual": (
                "你是一个资深文字编辑。请对以下笔记内容进行轻松口语风格润色，"
                "使其亲切自然，生动通俗，同时保持原文的核心原意。请直接输出润色后的内容：\n\n原文：\n" + content
            ),
            "polish_academic": (
                "你是一个资深文字编辑。请对以下笔记内容进行学术专业风格润色，"
                "严谨专业，使用规范学术语态，同时保持原文的核心原意。请直接输出润色后的内容：\n\n原文：\n" + content
            ),
            "continue": (
                "你是一个写作续写专家。请仔细阅读用户提供的上文内容，紧密顺承上文的行文逻辑与语气，自然流畅地继续往下创作续写内容。直接输出续写内容，不要重复上文，不要附带任何闲聊或开场白。\n\n上文内容：\n" + content
            ),
            "auto_format": (
                "你是一个专业的内容排版与格式化专家。请对以下杂乱、未排版的原始草稿或会议碎片进行标准化 Markdown 格式重构：1. 自动梳理逻辑层级，使用合适的 Markdown 标题；2. 将要点整理为清晰的无序或有序列表；3. 纠正错别字与缺失标点；4. 保持原文所有核心信息不变。请直接输出排版后的 Markdown 正文：\n\n原始草稿：\n" + content
            ),
            "correct": (
                "你是一个严谨的文字校对专家。请找出以下文本中的所有错别字、语病与标点错误，并直接输出修正后的完整文本：\n\n原文：\n" + content
            ),
            "expand": (
                "你是一个知识丰富、逻辑严密、文笔出色的专业写作与研究专家。\n"
                "用户在笔记中给出了简短的思考碎片、要点提纲、关键词或简略草稿。\n"
                "请你深入理解用户的核心意图，帮用户进行全面的【深度扩写与资料数据补充】：\n"
                "1. 【知识与背景补充】：补充相关的专业背景知识、行业常识、权威事实数据与发展脉络。\n"
                "2. 【逻辑架构展开】：将简短的要点扩充为结构完整、论述严谨的长文。合理分段，使用清晰的 Markdown 标题（H2/H3）组织章节。\n"
                "3. 【案例与细节丰富】：对每个要点补充生动的实际应用场景、具体案例或实施建议，避免空洞说教。\n"
                "4. 【专业优雅排版】：适当使用**粗体**突出核心概念，使用项目列表清晰罗列条目，关键要点使用 > 引用块 进行总结强调。\n"
                "5. 【忠于原意】：始终围绕用户原本表达的核心观点展开，不偏离主线。\n\n"
                "请直接输出扩写补充后的完整 Markdown 格式正文内容，不要附带多余的开场白或闲聊：\n\n用户原始笔记：\n" + content
            ),
            "translate": (
                f"请将以下笔记内容翻译成地道的 {target_lang}，保持排版格式与专业术语准确：\n\n" + content
            ),
            "mindmap": (
                "你是一个擅长提炼思维框架的专家。请根据以下笔记内容，生成 Mermaid 格式的思维导图（mindmap）。\n"
                "请严格按照 Mermaid mindmap 语法输出，仅输出 ```mermaid ... ``` 代码块，不要附带多余闲聊。\n\n"
                "格式示例：\n"
                "```mermaid\n"
                "mindmap\n"
                "  root((核心主题))\n"
                "    分支一\n"
                "      要点1\n"
                "      要点2\n"
                "    分支二\n"
                "      要点3\n"
                "```\n\n笔记内容：\n" + content
            ),
            "extract_tags": (
                "请根据以下笔记内容，提取 3 到 5 个最贴切的分类标签。"
                "请仅以 JSON 字符串数组格式返回，例如：[\"工作\", \"项目规划\", \"AI\"]\n\n内容：\n" + content
            )
        }
        return prompts.get(action, prompts["summary"])

    @staticmethod
    async def analyze_note_stream(content: str, action: str, target_lang: str = "English", db: Optional[Session] = None) -> AsyncGenerator[str, None]:
        """流式执行快捷笔记分析算子"""
        if not content.strip():
            yield "笔记内容为空，无法进行分析。"
            return

        config = get_ai_config(db) if db else {
            "api_key": settings.AI_API_KEY,
            "base_url": settings.AI_BASE_URL,
            "model_name": settings.AI_MODEL,
            "temperature": 0.7,
            "reasoning_effort": "medium"
        }

        if not config["api_key"] and "localhost" not in config["base_url"] and "127.0.0.1" not in config["base_url"]:
            yield (
                "【提示】当前尚未配置 AI API Key。请点击左下角「AI 与偏好设置」填入您的 API Key "
                "（支持 Claude Code / Anthropic, DeepSeek, OpenAI 或本地 Ollama 免费离线模型）。"
            )
            return

        user_prompt = AIService.get_prompt_for_action(action, content, target_lang)

        async for chunk in call_llm_stream(
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt="你是一个严谨、高效的 macOS 本地私有笔记 AI 助理。",
            config=config
        ):
            yield chunk

    @staticmethod
    async def analyze_note(content: str, action: str, target_lang: str = "English", db: Optional[Session] = None) -> str:
        chunks = []
        async for chunk in AIService.analyze_note_stream(content, action, target_lang, db):
            chunks.append(chunk)
        return "".join(chunks)

    @staticmethod
    async def chat_with_note_stream(messages: List[Dict[str, str]], note_context: str = "", audio_context: str = "", db: Optional[Session] = None) -> AsyncGenerator[str, None]:
        """流式智能问答 (Chat with Note Stream)"""
        config = get_ai_config(db) if db else {
            "api_key": settings.AI_API_KEY,
            "base_url": settings.AI_BASE_URL,
            "model_name": settings.AI_MODEL,
            "temperature": 0.7,
            "reasoning_effort": "medium"
        }

        system_content = (
            "你是一个内置在 macOS 本地笔记应用中的专属 AI 助理 (Note Copilot)。\n"
            "用户正在查看或编辑一篇笔记，并基于当前笔记内容向你提问。\n"
            "请基于用户提供的【当前笔记内容】和【录音转录内容】精准回答问题，语言亲切自然、条理分明。"
        )

        if note_context:
            system_content += f"\n\n【当前笔记内容】:\n{note_context}"
        if audio_context:
            system_content += f"\n\n【录音转录文本】:\n{audio_context}"

        async for chunk in call_llm_stream(
            messages=messages,
            system_prompt=system_content,
            config=config
        ):
            yield chunk

    @staticmethod
    async def chat_with_note(messages: List[Dict[str, str]], note_context: str = "", audio_context: str = "", db: Optional[Session] = None) -> str:
        chunks = []
        async for chunk in AIService.chat_with_note_stream(messages, note_context, audio_context, db):
            chunks.append(chunk)
        return "".join(chunks)

    @staticmethod
    async def generate_meeting_minutes(transcription: str, db: Optional[Session] = None) -> Dict[str, Any]:
        """将录音转录逐字稿转化为结构化会议纪要与待办清单"""
        if not transcription.strip():
            return {"summary": "录音未包含有效文字内容。", "action_items": []}

        config = get_ai_config(db) if db else {
            "api_key": settings.AI_API_KEY,
            "base_url": settings.AI_BASE_URL,
            "model_name": settings.AI_MODEL,
            "temperature": 0.3,
            "reasoning_effort": "low"
        }

        system_prompt = (
            "你是一个专业的智能会议与语音分析专家。用户会提供一段录音转录的逐字稿，"
            "你需要帮用户提炼出结构化的会议纪要。\n"
            "请严格以 JSON 格式输出，JSON 结构如下：\n"
            "{\n"
            '  "title": "简明扼要的会议/录音主题",\n'
            '  "overview": "100~200字核心背景与概要",\n'
            '  "key_decisions": ["核心结论1", "核心结论2"],\n'
            '  "action_items": [\n'
            '    {"task": "待办事项具体内容", "assignee": "负责人(如有)", "due_date": "截止时间(如有)"}\n'
            '  ],\n'
            '  "agenda_breakdown": ["分段讨论要点1", "分段讨论要点2"]\n'
            "}\n"
            "注意：仅返回合法 JSON，不要包含额外的 markdown 标记或闲聊。"
        )

        try:
            raw_text = await call_llm(
                messages=[{"role": "user", "content": transcription}],
                system_prompt=system_prompt,
                config=config
            )
            cleaned = raw_text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned.strip())
        except Exception as e:
            logger.error(f"Meeting minutes generation error: {e}")
            return {
                "title": "语音录音分析",
                "overview": f"转录文本已生成。AI 智能分析暂不可用: {str(e)}",
                "key_decisions": ["请在设置中配置有效 Claude / OpenAI API Key 即可开启深度分析。"],
                "action_items": [],
                "agenda_breakdown": []
            }
