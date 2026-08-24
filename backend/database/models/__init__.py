"""Importing this package registers every model on ``Base.metadata``."""

from database.models.chat import Chat, Message
from database.models.code import CodeChunk, IndexRecord, RepositoryFile
from database.models.repository import Repository
from database.models.user import User

__all__ = [
    "Chat",
    "CodeChunk",
    "IndexRecord",
    "Message",
    "Repository",
    "RepositoryFile",
    "User",
]
