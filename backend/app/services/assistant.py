from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.assistant import EditingCommand, EditingPlan

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You convert video editing requests into JSON editing plans. "
    "Reply with ONLY a JSON object — no markdown fences, no explanations.\n"
    "Schema: {\"commands\":[{\"action\":\"...\",\"params\":null}],\"warnings\":[]}\n"
    "Example for 'remove silences and fillers': "
    "{\"commands\":[{\"action\":\"remove_silence\",\"params\":null},{\"action\":\"remove_fillers\",\"params\":null}],\"warnings\":[]}\n"
    "Valid actions: remove_silence | remove_fillers | generate_subtitles | export\n"
    "generate_subtitles: generate SRT/VTT subtitle files from the transcript\n"
    "export params: {\"format\":\"mp4\",\"quality\":\"high\",\"resolution\":\"1080p\"}"
)

_FENCE_RE = re.compile(r"```(?:json)?\s*|\s*```", re.IGNORECASE)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

KNOWN_ACTIONS = frozenset({"remove_silence", "remove_fillers", "generate_subtitles", "export"})


def _strip_fences(text: str) -> str:
    return _FENCE_RE.sub("", text).strip()


class AssistantService:

    @classmethod
    async def generate_stream(
        cls,
        prompt: str,
        video_id: str,
    ) -> AsyncGenerator[str, None]:
        logger.info(
            "Assistant plan requested: video_id=%s prompt_len=%d",
            video_id,
            len(prompt),
        )

        url = f"{settings.ollama_base_url}/api/chat"
        payload: Dict[str, Any] = {
            "model": settings.ollama_model,
            "stream": True,
            "think": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }

        accumulated = ""

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0)) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        try:
                            err = json.loads(body).get("error", "")
                        except Exception:
                            err = body.decode(errors="replace")[:200]
                        if "not found" in err.lower() or "pull" in err.lower():
                            model = settings.ollama_model
                            msg = f"Model \"{model}\" is not installed. Run: ollama pull {model}"
                            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                        else:
                            msg = f"Ollama error: {err}"
                            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        content: str = chunk.get("message", {}).get("content", "")
                        if content:
                            accumulated += content
                            yield f"data: {json.dumps({'type': 'delta', 'content': content})}\n\n"

                        if chunk.get("done"):
                            break

        except httpx.ConnectError:
            logger.warning("Ollama unreachable: video_id=%s", video_id)
            yield (
                f"data: {json.dumps({'type': 'error', 'message': 'AI service unavailable — is Ollama running?'})}\n\n"
            )
            return
        except httpx.ReadTimeout:
            logger.warning("Ollama stream timed out: video_id=%s", video_id)
            yield (
                f"data: {json.dumps({'type': 'error', 'message': 'AI service timed out. Please try again.'})}\n\n"
            )
            return
        except Exception:
            logger.exception("Unexpected error during Ollama stream: video_id=%s", video_id)
            yield (
                f"data: {json.dumps({'type': 'error', 'message': 'An unexpected error occurred.'})}\n\n"
            )
            return

        cleaned = _strip_fences(_THINK_RE.sub("", accumulated))
        if not cleaned:
            yield (
                f"data: {json.dumps({'type': 'error', 'message': 'AI returned an empty response. Please try again.'})}\n\n"
            )
            return

        try:
            raw_data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("JSON parse failed: video_id=%s error=%s", video_id, exc)
            yield (
                f"data: {json.dumps({'type': 'error', 'message': 'AI response was not valid JSON. Please rephrase your prompt.'})}\n\n"
            )
            return

        raw_commands: List[Dict[str, Any]] = raw_data.get("commands", [])
        if not isinstance(raw_commands, list):
            raw_commands = []

        commands: List[EditingCommand] = []
        warnings: List[str] = []

        for raw_cmd in raw_commands:
            if not isinstance(raw_cmd, dict):
                continue
            action = raw_cmd.get("action", "")
            if action in KNOWN_ACTIONS:
                try:
                    commands.append(
                        EditingCommand(
                            action=action,  # type: ignore[arg-type]
                            params=raw_cmd.get("params"),
                        )
                    )
                except ValidationError:
                    warnings.append(str(action))
            elif action:
                warnings.append(str(action))

        plan = EditingPlan(commands=commands, warnings=warnings)
        logger.info(
            "Plan generated: video_id=%s commands=%d warnings=%d",
            video_id,
            len(commands),
            len(warnings),
        )
        yield (
            f"data: {json.dumps({'type': 'plan', 'commands': [c.model_dump() for c in plan.commands], 'warnings': plan.warnings})}\n\n"
        )
