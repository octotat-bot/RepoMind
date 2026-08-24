"""Ollama chat backend — the local, private default."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ai.llm.base import ChatModel, ProviderStatus
from app.core.config import settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaChatModel(ChatModel):
    provider = "ollama"

    def __init__(self, model: str | None = None, base_url: str | None = None) -> None:
        self.model = model or settings.ollama_chat_model
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=10.0),
        )

    def _options(self, **overrides: object) -> dict[str, object]:
        return {
            "temperature": settings.ollama_temperature,
            "num_ctx": settings.ollama_num_ctx,
            **overrides,
        }

    async def stream_chat(
        self, messages: list[dict[str, str]], **options: object
    ) -> AsyncIterator[str]:
        """Yield response tokens as they are produced.

        Ollama streams newline-delimited JSON; each object carries an
        incremental ``message.content`` fragment.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": self._options(**options),
        }

        try:
            async with self._client.stream("POST", "/api/chat", json=payload) as response:
                if response.status_code == 404:
                    raise UpstreamError(
                        f"Ollama does not have '{self.model}'. Run: ollama pull {self.model}"
                    )
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if error := event.get("error"):
                        raise UpstreamError(f"Ollama error: {error}")

                    fragment = event.get("message", {}).get("content", "")
                    if fragment:
                        yield fragment
                    if event.get("done"):
                        return
        except UpstreamError:
            raise
        except httpx.HTTPError as exc:
            raise UpstreamError(
                f"Could not reach Ollama at {self.base_url}. Is `ollama serve` running? ({exc})"
            ) from exc

    async def installed_models(self) -> list[str]:
        try:
            response = await self._client.get("/api/tags", timeout=5.0)
            response.raise_for_status()
            return [model["name"] for model in response.json().get("models", [])]
        except (httpx.HTTPError, KeyError, ValueError):
            return []

    async def status(self) -> ProviderStatus:
        installed = await self.installed_models()
        if not installed:
            return ProviderStatus(
                ok=False,
                provider=self.provider,
                model=self.model,
                endpoint=self.base_url,
                detail="Ollama is not reachable. Start it with `ollama serve`.",
            )

        # Ollama reports "llama3.2:3b" but users may configure "llama3.2".
        available = {name.split(":")[0] for name in installed} | set(installed)
        required = {self.model, settings.ollama_embed_model}
        missing = sorted(
            name for name in required
            if name not in available and name.split(":")[0] not in available
        )

        return ProviderStatus(
            ok=not missing,
            provider=self.provider,
            model=self.model,
            endpoint=self.base_url,
            detail=None if not missing else f"Missing model(s): {', '.join(missing)}",
            available_models=installed,
            missing_models=missing,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
