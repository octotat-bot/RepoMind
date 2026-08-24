"""Chat backend for any OpenAI-compatible endpoint.

Covers Groq, Together, OpenRouter, Ollama's own /v1 shim and OpenAI itself —
they all speak the same ``/chat/completions`` SSE protocol, so only the base URL,
key and model name differ. Groq is the default for deployed instances because it
serves open Llama models on a free tier with no card required.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ai.llm.base import ChatModel, ProviderStatus
from app.core.config import settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger

logger = get_logger(__name__)

_DONE = "[DONE]"


class OpenAICompatibleChatModel(ChatModel):
    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        provider: str | None = None,
    ) -> None:
        self.provider = provider or settings.chat_provider
        self.model = model or settings.chat_model
        self.base_url = (base_url or settings.chat_base_url).rstrip("/")
        self._api_key = api_key or settings.chat_api_key or ""

        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=15.0),
            headers={"Authorization": f"Bearer {self._api_key}"} if self._api_key else {},
        )

    async def stream_chat(
        self, messages: list[dict[str, str]], **options: object
    ) -> AsyncIterator[str]:
        if not self._api_key:
            raise UpstreamError(
                f"No API key configured for '{self.provider}'. "
                "Set CHAT_API_KEY, or switch CHAT_PROVIDER back to 'ollama'."
            )

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": options.get("temperature", settings.ollama_temperature),
        }

        try:
            async with self._client.stream(
                "POST", "/chat/completions", json=payload
            ) as response:
                if response.status_code in (401, 403):
                    raise UpstreamError(
                        f"{self.provider} rejected the API key. Check CHAT_API_KEY."
                    )
                if response.status_code == 429:
                    raise UpstreamError(
                        f"{self.provider} rate limit reached. Wait a moment and try again."
                    )
                if response.status_code >= 400:
                    # The body carries the useful message, and it is not streamed.
                    body = (await response.aread()).decode("utf-8", "replace")[:400]
                    raise UpstreamError(f"{self.provider} error {response.status_code}: {body}")

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == _DONE:
                        if data == _DONE:
                            return
                        continue

                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    fragment = (choices[0].get("delta") or {}).get("content")
                    if fragment:
                        yield fragment
                    if choices[0].get("finish_reason"):
                        return
        except UpstreamError:
            raise
        except httpx.HTTPError as exc:
            raise UpstreamError(
                f"Could not reach {self.provider} at {self.base_url} ({exc})."
            ) from exc

    async def status(self) -> ProviderStatus:
        if not self._api_key:
            return ProviderStatus(
                ok=False,
                provider=self.provider,
                model=self.model,
                endpoint=self.base_url,
                detail="No API key configured (CHAT_API_KEY).",
            )

        # A models listing is the cheapest call that proves both reachability
        # and that the key is valid.
        try:
            response = await self._client.get("/models", timeout=10.0)
            if response.status_code in (401, 403):
                return ProviderStatus(
                    ok=False, provider=self.provider, model=self.model,
                    endpoint=self.base_url, detail="API key was rejected.",
                )
            response.raise_for_status()
            names = [entry.get("id", "") for entry in response.json().get("data", [])]
        except (httpx.HTTPError, ValueError) as exc:
            return ProviderStatus(
                ok=False, provider=self.provider, model=self.model,
                endpoint=self.base_url, detail=f"Unreachable: {exc}",
            )

        # An empty listing is not an error; some gateways do not implement it.
        missing = [self.model] if names and self.model not in names else []
        return ProviderStatus(
            ok=not missing,
            provider=self.provider,
            model=self.model,
            endpoint=self.base_url,
            detail=None if not missing else f"'{self.model}' is not offered by {self.provider}.",
            available_models=names[:20],
            missing_models=missing,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
