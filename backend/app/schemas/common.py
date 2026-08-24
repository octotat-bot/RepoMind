"""Base schema configuration.

The API speaks camelCase because its only consumer is a JavaScript frontend;
Python keeps snake_case internally and Pydantic translates at the boundary.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(word.capitalize() for word in tail)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class MessageResponse(CamelModel):
    message: str
    ok: bool = True
