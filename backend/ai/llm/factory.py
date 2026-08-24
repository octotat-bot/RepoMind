"""Chat backend selection and process-wide reuse."""

from __future__ import annotations

from ai.llm.base import ChatModel
from ai.llm.ollama import OllamaChatModel
from ai.llm.openai_compatible import OpenAICompatibleChatModel
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Every hosted option speaks the OpenAI protocol; only the default endpoint
# differs, so one implementation covers them all.
_HOSTED_PROVIDERS = {"groq", "openai", "openrouter", "together", "custom"}

_instance: ChatModel | None = None


def build_chat_model(provider: str | None = None) -> ChatModel:
    selected = (provider or settings.chat_provider).lower()

    if selected in _HOSTED_PROVIDERS:
        return OpenAICompatibleChatModel(provider=selected)

    if selected != "ollama":
        logger.warning("Unknown CHAT_PROVIDER '%s'; falling back to ollama.", selected)
    return OllamaChatModel()


def get_chat_model() -> ChatModel:
    """Return the shared chat backend, keeping one connection pool alive."""
    global _instance
    if _instance is None:
        _instance = build_chat_model()
        logger.info("Chat provider: %s (%s)", _instance.provider, _instance.model)
    return _instance


async def close_chat_model() -> None:
    global _instance
    if _instance is not None:
        await _instance.aclose()
        _instance = None
