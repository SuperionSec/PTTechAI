import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI

from backend.common.config import settings
from backend.common.db.database import close_db, init_db


async def execute_scheduled_scan(target: str, scan_type: str, agent_role: str | None, llm_profile: str | None) -> dict:
    from backend.common.db.database import async_session_factory
    from backend.models import Scan, Target
    from backend.pentest.backend.services.scan_service import run_scan_task

    async with async_session_factory() as db:
        config = {}
        if agent_role:
            config["agent_role"] = agent_role
        if llm_profile:
            config["llm_profile"] = llm_profile

        scan = Scan(
            name=f"Scheduled Scan {datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M')}",
            scan_type=scan_type,
            recon_enabled=True,
            config=config,
            status="running",
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
            current_phase="initializing",
            progress=0,
        )
        db.add(scan)
        await db.flush()

        parsed = urlparse(target)
        db.add(Target(
            scan_id=scan.id,
            url=target,
            hostname=parsed.hostname or target,
            port=parsed.port or (443 if parsed.scheme == "https" else 80),
            protocol=parsed.scheme or "https",
            path=parsed.path or "/",
        ))
        await db.commit()
        scan_id = scan.id

    asyncio.create_task(run_scan_task(scan_id))
    return {"scan_id": scan_id, "target": target, "scan_type": scan_type}


async def startup_app(app: FastAPI) -> None:
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    await init_db()
    print("Database initialized")

    try:
        from backend.scripts.init_admin import init_admin
        await init_admin()
    except Exception as e:
        print(f"Admin init warning: {e}")

    try:
        from backend.scripts.init_permissions import init_permissions
        await init_permissions()
    except Exception as e:
        print(f"Permission init warning: {e}")

    try:
        config_path = Path(__file__).parent.parent / "config" / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
            from backend.pentest.core.scheduler import ScanScheduler
            scan_scheduler = ScanScheduler(config)
            scan_scheduler.set_scan_callback(execute_scheduled_scan)
            scan_scheduler.start()
            app.state.scheduler = scan_scheduler
            print(f"Scheduler initialized (enabled={scan_scheduler.enabled})")
        else:
            app.state.scheduler = None
    except Exception as e:
        print(f"Scheduler init skipped: {e}")
        app.state.scheduler = None

    try:
        from backend.pentest.core.container_pool import get_pool
        pool = get_pool()
        await pool.cleanup_orphans()
        print("Sandbox pool initialized (orphan cleanup done)")
    except Exception as e:
        print(f"Sandbox pool init skipped: {e}")

    try:
        from backend.pentest.backend.core.smart_router import init_router
        await init_router()
    except Exception as e:
        print(f"Smart Router init skipped: {e}")


async def shutdown_app(app: FastAPI) -> None:
    try:
        from backend.pentest.backend.core.smart_router import shutdown_router
        await shutdown_router()
    except Exception:
        pass

    try:
        from backend.pentest.core.container_pool import get_pool
        await get_pool().cleanup_all()
        print("Sandbox containers cleaned up")
    except Exception:
        pass

    if hasattr(app.state, 'scheduler') and app.state.scheduler:
        app.state.scheduler.stop()
    print("Shutting down...")
    await close_db()
