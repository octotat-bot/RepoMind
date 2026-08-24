"""Chat model interface.

Generation is abstracted because the deployment target dictates the provider:
Ollama locally (private, free, no keys) and a hosted OpenAI-compatible endpoint
in the cloud, where no free host can run a GPU. Everything above this interface
is identical either way.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class ProviderStatus:
    """What a health check needs to report about the generation backend."""

    ok: bool
    provider: str
    model: str
    endpoint: str
    detail: str | None = None
    available_models: list[str] = field(default_factory=list)
    missing_models: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "provider": self.provider,
            "model": self.model,
            "endpoint": self.endpoint,
            "detail": self.detail,
            "availableModels": self.available_models,
            "missingModels": self.missing_models,
        }


class ChatModel(ABC):
    """A streaming chat completion backend."""

    provider: str
    model: str

    @abstractmethod
    def stream_chat(self, messages: list[dict[str, str]], **options: object) -> AsyncIterator[str]:
        """Yield response text incrementally as the model produces it."""

    async def complete(self, messages: list[dict[str, str]], **options: object) -> str:
        """Collect a full response. Used for short internal calls."""
        return "".join([chunk async for chunk in self.stream_chat(messages, **options)])

    @abstractmethod
    async def status(self) -> ProviderStatus:
        """Report reachability and model availability for the health endpoint."""

    async def aclose(self) -> None:
        return None
