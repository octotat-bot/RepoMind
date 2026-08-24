"""Check a managed Postgres connection string before deploying with it.

A bad DATABASE_URL is the most common way a first deployment fails, and it
surfaces on the host as a startup crash with a driver-level traceback. Testing
it from your own machine first turns that into a clear yes or no.

    backend/.venv/bin/python backend/tests/verify_database_url.py "postgresql://..."

or

    DATABASE_URL="postgresql://..." backend/.venv/bin/python backend/tests/verify_database_url.py

Paste the string exactly as the provider gives it — rewriting it by hand is
itself a common mistake. This prints the normalised form so you can see what
the app will actually connect with.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings  # noqa: E402


def redact(url: str) -> str:
    """Hide the password so the output is safe to paste into a chat or issue."""
    return re.sub(r"://([^:/@]+):([^@]+)@", r"://\1:••••••@", url)


async def check(raw_url: str) -> int:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    normalised = Settings(database_url=raw_url).database_url

    print("\n  You pasted:")
    print(f"    {redact(raw_url)}")
    print("\n  RepoMind will connect with:")
    print(f"    {redact(normalised)}")

    if normalised != raw_url:
        print("\n  (rewritten for the async driver — this is expected and automatic)")

    if not normalised.startswith("postgresql+asyncpg://"):
        print("\n  ✗ That is not a Postgres URL. Neon strings start with 'postgresql://'.")
        return 1

    print("\n  Connecting…")
    engine = create_async_engine(normalised, echo=False)
    try:
        async with engine.begin() as connection:
            version = (await connection.execute(text("SELECT version()"))).scalar_one()
            database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
        print(f"  ✓ Connected to '{database}'")
        print(f"    {version.split(',')[0]}")
    except Exception as exc:  # noqa: BLE001 - the message is the whole point
        print(f"\n  ✗ Could not connect:\n    {type(exc).__name__}: {exc}")
        print("\n  Common causes:")
        print("    · the password was not copied in full")
        print("    · the project is paused — open the Neon dashboard to wake it")
        print("    · the string is the 'psql' command, not the URL itself")
        await engine.dispose()
        return 1

    # Creating the schema is what the API does on startup, so proving it works
    # here means the deployment will not fail on its first boot.
    print("\n  Creating the schema…")
    try:
        from database.base import Base
        from database import models  # noqa: F401  (registers the mappers)

        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with engine.begin() as connection:
            tables = (
                await connection.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public' ORDER BY table_name"
                    )
                )
            ).scalars().all()

        print(f"  ✓ {len(tables)} tables ready: {', '.join(tables)}")
    except Exception as exc:  # noqa: BLE001
        print(f"\n  ✗ Could not create the schema:\n    {type(exc).__name__}: {exc}")
        await engine.dispose()
        return 1
    finally:
        await engine.dispose()

    print("\n  This connection string is ready. Paste the ORIGINAL into Render")
    print("  as DATABASE_URL — the app does the rewriting itself.\n")
    return 0


def main() -> None:
    raw_url = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DATABASE_URL", "")
    if not raw_url:
        print(__doc__)
        sys.exit(2)

    sys.exit(asyncio.run(check(raw_url.strip())))


if __name__ == "__main__":
    main()
