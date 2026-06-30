"""Business logic service for apptest module."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.config import settings
from backend.common.db.database import async_session_factory

from .client import get_ijiami_client, IJiamiClient, IJiamiError, set_ijiami_client
from .models import AppTestTask
from .schemas import (
    AppTestAppAction,
    AppTestAsset,
    AppTestAssetsResponse,
    AppTestBaseInfo,
    AppTestConfig,
    AppTestConfigResponse,
    AppTestConfigUpdate,
    AppTestPermission,
    AppTestSDK,
    AppTestStatOverview,
    AppTestStatRiskItem,
    AppTestStatRiskType,
    AppTestStatTrend,
    AppTestStatisticsResponse,
    AppTestStrategiesResponse,
    AppTestStrategy,
    AppTestTaskCreate,
    AppTestTaskDetailResponse,
    AppTestTaskListResponse,
    AppTestTaskResponse,
    AppTestTaskStatusResponse,
    AppTestTaskSummary,
    AppTestVersionHistoryResponse,
    AppTestVersionRisk,
    AppTestVersionScore,
    AppTestVulnerability,
    AppTestVulnsResponse,
    get_detection_status_name,
    get_terminal_type_name,
)


logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
CONFIG_PATH = Path(__file__).parent / "data" / "config.json"


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


def _save_config_file(client: IJiamiClient) -> None:
    """Persist iJiami connection config to disk so it survives restarts."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "base_url": client.base_url,
        "client_id": client.client_id,
        "client_secret": client.client_secret,
        "username": client.username,
        "password": client.password,
    }
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONFIG_PATH)


def load_persisted_config() -> None:
    """Load saved config (if any) into the active client. Called at startup.

    Persisted config takes precedence over environment variables so that
    changes made through the UI survive restarts.
    """
    if not CONFIG_PATH.exists():
        return
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("apptest: failed to read persisted config at %s", CONFIG_PATH)
        return
    set_ijiami_client(IJiamiClient(
        base_url=data.get("base_url") or None,
        client_id=data.get("client_id") or None,
        client_secret=data.get("client_secret") or None,
        username=data.get("username") or None,
        password=data.get("password") or None,
    ))
    logger.info("apptest: loaded persisted iJiami config from %s", CONFIG_PATH)


async def get_config() -> AppTestConfigResponse:
    client = get_ijiami_client()
    connected = False
    try:
        await client.login()
        connected = True
    except Exception:
        pass
    return AppTestConfigResponse(
        base_url=client.base_url,
        client_id=client.client_id,
        client_secret=_mask(client.client_secret),
        username=client.username,
        password=_mask(client.password),
        connected=connected,
    )


async def update_config(data: AppTestConfigUpdate) -> AppTestConfigResponse:
    current = get_ijiami_client()
    new_client = IJiamiClient(
        base_url=data.base_url or current.base_url,
        client_id=data.client_id or current.client_id,
        client_secret=data.client_secret or current.client_secret,
        username=data.username or current.username,
        password=data.password or current.password,
    )
    # Test connection before saving
    try:
        await new_client.login()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {exc}")

    set_ijiami_client(new_client)
    # Persist to disk (survives restart) and mirror into runtime settings
    _save_config_file(new_client)
    settings.IJIAMI_BASE_URL = new_client.base_url
    settings.IJIAMI_CLIENT_ID = new_client.client_id
    settings.IJIAMI_CLIENT_SECRET = new_client.client_secret
    settings.IJIAMI_USERNAME = new_client.username
    settings.IJIAMI_PASSWORD = new_client.password

    return await get_config()


async def test_connection(data: AppTestConfigUpdate | None = None) -> dict[str, Any]:
    """Test iJiami connection with given (or current) credentials without saving."""
    current = get_ijiami_client()
    if data:
        client = IJiamiClient(
            base_url=data.base_url or current.base_url,
            client_id=data.client_id or current.client_id,
            client_secret=data.client_secret or current.client_secret,
            username=data.username or current.username,
            password=data.password or current.password,
        )
    else:
        client = current
    try:
        await client.login()
        return {"connected": True, "message": "连接成功"}
    except Exception as exc:
        return {"connected": False, "message": str(exc)}



# ------------------------------------------------------------------
# Strategies
# ------------------------------------------------------------------
async def list_strategies(terminal_type: int | None = None) -> AppTestStrategiesResponse:
    client = get_ijiami_client()
    try:
        result = await client.list_strategies(terminal_type=terminal_type, page_size=1000)
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    page_data = result.get("data", {})
    if isinstance(page_data, list):
        items = page_data
    else:
        items = page_data.get("list", [])

    strategies = []
    for item in items:
        if not isinstance(item, dict):
            continue
        terminal = item.get("terminalType")
        if isinstance(terminal, dict):
            terminal = terminal.get("value")
        strategies.append(AppTestStrategy(
            id=item.get("id"),
            name=item.get("name") or "",
            template_id=item.get("templateId"),
            terminal_type=terminal,
            terminal_type_name=get_terminal_type_name(terminal) if terminal else "",
            detection_item_count=item.get("detectionItemCount") or 0,
            use_count=item.get("useCount") or 0,
            status=item.get("status") if item.get("status") is not None else 1,
            remark=item.get("remark") or "",
            create_time=item.get("createTime"),
        ))

    total = page_data.get("total", len(strategies)) if isinstance(page_data, dict) else len(strategies)
    return AppTestStrategiesResponse(strategies=strategies, total=total)


# ------------------------------------------------------------------
# Assets
# ------------------------------------------------------------------
async def list_assets(
    terminal_type: int | None = None,
    app_name: str | None = None,
) -> AppTestAssetsResponse:
    client = get_ijiami_client()
    try:
        result = await client.list_assets(terminal_type=terminal_type, app_name=app_name)
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    data = result.get("data", {})
    assets_list = data.get("assetsList", []) if isinstance(data, dict) else []
    assets = []
    for item in assets_list:
        if not isinstance(item, dict):
            continue
        t_type = item.get("terminalType")
        if isinstance(t_type, str):
            t_type = _terminal_type_from_name(t_type)
        assets.append(AppTestAsset(
            assets_id=str(item.get("id") or ""),
            name=item.get("name") or "",
            version=item.get("version") or "",
            package=item.get("package") or "",
            md5=item.get("md5") or "",
            size=str(item.get("size") or ""),
            terminal_type=t_type,
            terminal_type_name=get_terminal_type_name(t_type) if t_type else "",
            detection_count=item.get("detectionCount") or 0,
            detection_score=str(item.get("detectionScore") or ""),
            logo=item.get("logo"),
            create_time=item.get("createTime"),
        ))

    return AppTestAssetsResponse(assets=assets, total=len(assets))


def _terminal_type_from_name(name: str) -> int | None:
    mapping = {
        "ANDROID": 1, "IOS": 2, "SDK": 7, "IOT": 8,
        "AAB": 9, "HONGMENG": 10, "H5": 12, "HARMONYOS": 14,
    }
    return mapping.get(name.upper())


# ------------------------------------------------------------------
# Tasks
# ------------------------------------------------------------------
async def reconcile_stale_tasks(max_age_minutes: int = 60) -> int:
    """Mark tasks stuck in 'uploading' as failed on startup.

    In-memory background workers (asyncio.create_task) are lost if the process
    restarts mid-upload, leaving tasks permanently in 'uploading'. Running tasks
    that already have a document_id can still be recovered by status polling, so
    we only reap 'uploading' tasks (which have no remote handle yet) and any
    'running' task with no document_id.
    """
    from sqlalchemy import and_, or_

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=max_age_minutes)
    async with async_session_factory() as db:
        result = await db.execute(
            select(AppTestTask).where(
                or_(
                    AppTestTask.status == "uploading",
                    and_(AppTestTask.status == "running", AppTestTask.document_id.is_(None)),
                ),
                AppTestTask.created_at < cutoff,
            )
        )
        stale = result.scalars().all()
        for task in stale:
            task.status = "failed"
            task.error_message = "任务执行过程中服务重启，已自动终止"
        if stale:
            await db.commit()
            logger.info("apptest: reconciled %d stale task(s) on startup", len(stale))
        return len(stale)


async def create_task(
    db: AsyncSession,
    data: AppTestTaskCreate,
    file_content: bytes,
    filename: str,
    user_id: str | None = None,
) -> AppTestTaskResponse:
    """Create a detection task and return immediately.

    The file upload to iJiami and detection start are slow (large APK uploads can
    take tens of seconds), so they run in a background task. The endpoint returns
    right away with a task in the ``uploading`` state; the frontend then polls
    ``/tasks/{id}/status`` to follow progress.
    """
    task_id = str(uuid.uuid4())

    # Persist a pending record synchronously so the client gets an id instantly.
    task = AppTestTask(
        id=task_id,
        name=data.name,
        terminal_type=data.terminal_type,
        terminal_type_name=get_terminal_type_name(data.terminal_type),
        template_id=data.template_id,
        template_name=data.template_name,
        status="uploading",
        progress=0.0,
        file_name=filename,
        created_by=user_id or "",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Kick off the slow upload + detection start in the background.
    asyncio.create_task(
        _upload_and_start(task_id, data, file_content, filename)
    )

    return _task_to_response(task)


async def _upload_and_start(
    task_id: str,
    data: AppTestTaskCreate,
    file_content: bytes,
    filename: str,
) -> None:
    """Background worker: upload the file to iJiami and start detection."""
    client = get_ijiami_client()
    async with async_session_factory() as db:
        task = await db.scalar(select(AppTestTask).where(AppTestTask.id == task_id))
        if not task:
            logger.warning("apptest background task %s vanished before processing", task_id)
            return
        try:
            # Step 1: Upload file to iJiami.
            upload_result = await client.upload_asset(
                file_content=file_content,
                filename=filename,
                assets_name=data.name,
                terminal_type=data.terminal_type,
            )
            upload_data = upload_result.get("data", {})
            if isinstance(upload_data, dict):
                task.assets_id = str(upload_data.get("id", ""))
                task.md5 = upload_data.get("md5", "")
                task.package_name = upload_data.get("package", "")
                task.version = upload_data.get("version", "")
                task.file_size = str(upload_data.get("size", ""))
            else:
                task.assets_id = str(upload_data) if upload_data else None
            await db.commit()

            # Step 2: Start detection
            if task.assets_id:
                start_result = await client.start_detection(
                    assets_id=task.assets_id,
                    template_id=data.template_id,
                    terminal_type=data.terminal_type,
                    callback=data.callback,
                    callback_url=data.callback_url,
                )
                start_data = start_result.get("data", {})
                # Extract the document id, keeping None semantics (never the
                # literal string "None") so status sync doesn't query a bogus id.
                doc_value: Any = None
                if isinstance(start_data, dict):
                    doc_value = start_data.get("data", start_data)
                else:
                    doc_value = start_data
                task.document_id = str(doc_value) if doc_value else None

            if not task.document_id:
                # Upload succeeded but detection didn't return a usable document id.
                task.status = "failed"
                task.error_message = "检测启动失败：未返回检测任务ID"
                await db.commit()
                logger.warning("apptest task %s: no document_id from start_detection", task_id)
                return

            task.status = "running"
            await db.commit()
        except IJiamiError as exc:
            task.status = "failed"
            task.error_message = str(exc) or repr(exc)
            await db.commit()
            logger.warning("apptest task %s failed (iJiami): %s", task_id, exc)
        except httpx.TimeoutException as exc:
            task.status = "failed"
            task.error_message = f"上传或检测超时，请重试或检查网络（{type(exc).__name__}）"
            await db.commit()
            logger.warning("apptest task %s timed out: %r", task_id, exc)
        except Exception as exc:  # noqa: BLE001 - record any failure on the task
            task.status = "failed"
            task.error_message = str(exc) or f"{type(exc).__name__}: 任务执行失败"
            await db.commit()
            logger.exception("apptest task %s failed", task_id)



async def list_tasks(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    status: str | None = None,
    terminal_type: int | None = None,
) -> AppTestTaskListResponse:
    query = select(AppTestTask)
    count_query = select(func.count()).select_from(AppTestTask)
    if status:
        query = query.where(AppTestTask.status == status)
        count_query = count_query.where(AppTestTask.status == status)
    if terminal_type is not None:
        query = query.where(AppTestTask.terminal_type == terminal_type)
        count_query = count_query.where(AppTestTask.terminal_type == terminal_type)
    query = query.order_by(desc(AppTestTask.created_at))

    total = await db.scalar(count_query) or 0

    result = await db.execute(query.offset((page - 1) * per_page).limit(per_page))
    tasks = result.scalars().all()

    summaries = [_task_to_summary(t) for t in tasks]
    return AppTestTaskListResponse(tasks=summaries, total=total)


async def get_task(db: AsyncSession, task_id: str) -> AppTestTaskResponse:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task)


async def delete_task(db: AsyncSession, task_id: str) -> None:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()


async def get_task_status(db: AsyncSession, task_id: str) -> AppTestTaskStatusResponse:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Sync with iJiami if we have a document_id
    if task.document_id and task.status in ("pending", "running"):
        try:
            client = get_ijiami_client()
            ijiami_status = await client.get_detection_status(task.document_id)
            data = ijiami_status.get("data", {})
            if isinstance(data, dict):
                _update_task_from_ijiami_status(task, data)
                await db.commit()
                await db.refresh(task)
        except Exception:
            pass  # Don't fail if iJiami is unreachable

    return AppTestTaskStatusResponse(
        id=task.id,
        document_id=task.document_id,
        status=task.status,
        progress=task.progress,
        score=task.score,
        detection_status=None,
        apk_detection_status=None,
    )


def _update_task_from_ijiami_status(task: AppTestTask, data: dict[str, Any]) -> None:
    """Update local task from iJiami status response."""
    # iJiami status fields vary by terminal type
    progress = data.get("progress")
    if progress is not None:
        task.progress = float(progress)

    # Android/SDK/HarmonyOS use apkDetectionStatus
    apk_status = data.get("apkDetectionStatus")
    if apk_status is not None:
        task.progress = _map_ijiami_status_to_progress(int(apk_status), task.progress)
        if int(apk_status) == 4:
            task.status = "completed"
            task.score = data.get("apkDetectionScore")
            if not task.completed_at:
                task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        elif int(apk_status) == 3:
            task.status = "failed"

    # Wechat/MiniApp/H5 use detectionStatus
    det_status = data.get("detectionStatus")
    if det_status is not None:
        task.progress = _map_ijiami_status_to_progress(int(det_status), task.progress)
        if int(det_status) == 4:
            task.status = "completed"
            task.score = data.get("detectionScore")
            if not task.completed_at:
                task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        elif int(det_status) == 3:
            task.status = "failed"

    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)


def _map_ijiami_status_to_progress(status_code: int, current_progress: float) -> float:
    mapping = {1: 0.0, 2: max(current_progress, 0.5), 3: current_progress, 4: 1.0}
    return mapping.get(status_code, current_progress)


# ------------------------------------------------------------------
# Vulnerabilities
# ------------------------------------------------------------------
async def get_task_vulnerabilities(
    db: AsyncSession,
    task_id: str,
    page: int = 1,
    per_page: int = 1000,
) -> AppTestVulnsResponse:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.document_id:
        return AppTestVulnsResponse(vulnerabilities=[], total=0)

    try:
        client = get_ijiami_client()
        result = await client.get_vulnerabilities(
            document_id=task.document_id,
            terminal_type=task.terminal_type,
            page_num=page,
            page_size=per_page,
        )
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    data = result.get("data", {})
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("list", [])
    else:
        items = []

    vulnerabilities = []
    high_count = mid_count = low_count = 0

    def _name_of(val: Any) -> str:
        """Extract display name from iJiami nested {value, name} objects or plain values."""
        if isinstance(val, dict):
            return str(val.get("name", ""))
        return "" if val is None else str(val)

    for item in items:
        if not isinstance(item, dict):
            continue
        grade = item.get("grade", {})
        if isinstance(grade, dict):
            grade_name = grade.get("name", "")
            grade_value = grade.get("value")
        else:
            grade_name = str(grade)
            grade_value = None

        # Count severity. iJiami grade value: 3=高(high), 2=中(mid), 1=低(low).
        if grade_value == 3 or "高" in grade_name:
            high_count += 1
        elif grade_value == 2 or "中" in grade_name:
            mid_count += 1
        elif grade_value == 1 or "低" in grade_name:
            low_count += 1

        vuln = AppTestVulnerability(
            id=str(item.get("id", "")),
            detection_item_id=str(item.get("detectionItemId", "")),
            name=_name_of(item.get("name", "")),
            purpose=_name_of(item.get("purpose", "")),
            grade=grade_name,
            grade_value=grade_value,
            harm=_name_of(item.get("harm", "")),
            solution=_name_of(item.get("solution", "")),
            result=_name_of(item.get("result", "")),
            result_detail=_name_of(item.get("resultDetail", "")),
            describe=_name_of(item.get("describe", "")),
            type_name=_name_of(item.get("typeName", "")),
            detail_pre=_name_of(item.get("detailPre", "")),
            detection_item_type=_name_of(item.get("detectionItemType", "")),
            terminal_type=item.get("terminalType", {}).get("value") if isinstance(item.get("terminalType"), dict) else item.get("terminalType"),
            order_no=item.get("orderNo"),
            item_no=item.get("itemNo"),
            platform=item.get("platform"),
            is_dynamic=bool(item.get("isDynamic") or False),
        )
        vulnerabilities.append(vuln)

    # Update task vuln counts
    task.vuln_high = high_count
    task.vuln_mid = mid_count
    task.vuln_low = low_count
    await db.commit()

    return AppTestVulnsResponse(
        vulnerabilities=vulnerabilities,
        total=len(vulnerabilities),
        high_count=high_count,
        mid_count=mid_count,
        low_count=low_count,
    )


# ------------------------------------------------------------------
# Reports
# ------------------------------------------------------------------
async def download_report(
    db: AsyncSession,
    task_id: str,
    report_type: int = 1,
) -> tuple[bytes, str, str]:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.document_id:
        raise HTTPException(status_code=400, detail="Task has no document_id")

    try:
        client = get_ijiami_client()
        content = await client.download_report(
            document_id=task.document_id,
            report_type=report_type,
            terminal_type=task.terminal_type,
        )
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    # Detect the real format from magic bytes. iJiami may return PDF even when
    # a Word report was requested, so trust the actual content over report_type.
    if content[:4] == b"%PDF":
        ext, media = ".pdf", "application/pdf"
    elif content[:2] == b"PK":  # docx/xlsx are ZIP-based
        ext = ".docx" if report_type == 1 else ".xlsx"
        media = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if report_type == 1
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    else:
        ext = ".docx" if report_type == 1 else ".pdf"
        media = "application/octet-stream"
    filename = f"{task.name}_report{ext}"
    return content, filename, media


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _task_to_response(task: AppTestTask) -> AppTestTaskResponse:
    return AppTestTaskResponse(
        id=task.id,
        name=task.name,
        assets_id=task.assets_id,
        document_id=task.document_id,
        terminal_type=task.terminal_type,
        terminal_type_name=task.terminal_type_name,
        template_id=task.template_id,
        template_name=task.template_name,
        status=task.status,
        progress=task.progress,
        score=task.score,
        file_name=task.file_name,
        file_size=task.file_size,
        md5=task.md5,
        package_name=task.package_name,
        version=task.version,
        vuln_high=task.vuln_high,
        vuln_mid=task.vuln_mid,
        vuln_low=task.vuln_low,
        vuln_danger=task.vuln_danger,
        report_type=task.report_type,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
        created_by=task.created_by,
    )


def _task_to_summary(task: AppTestTask) -> AppTestTaskSummary:
    return AppTestTaskSummary(
        id=task.id,
        name=task.name,
        terminal_type=task.terminal_type,
        terminal_type_name=task.terminal_type_name,
        template_name=task.template_name,
        status=task.status,
        progress=task.progress,
        score=task.score,
        vuln_high=task.vuln_high,
        vuln_mid=task.vuln_mid,
        vuln_low=task.vuln_low,
        vuln_danger=task.vuln_danger,
        file_name=task.file_name,
        file_size=task.file_size,
        package_name=task.package_name,
        version=task.version,
        created_at=task.created_at,
        completed_at=task.completed_at,
        created_by=task.created_by,
    )


# ------------------------------------------------------------------
# Statistics (data overview dashboard)
# ------------------------------------------------------------------
async def get_statistics(
    dimension: int = 3,
    terminal_type: int = 1,
    package_name: str | None = None,
) -> AppTestStatisticsResponse:
    client = get_ijiami_client()
    try:
        result = await client.get_data_statistics(
            dimension=dimension, terminal_type=terminal_type, package_name=package_name
        )
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    data = result.get("data", {}) or {}
    ov = data.get("dataStatisticsOverviewVO", {}) or {}
    overview = AppTestStatOverview(
        app_num=ov.get("appNum", 0) or 0,
        task_num=ov.get("taskNum", 0) or 0,
        version_num=ov.get("versionNum", 0) or 0,
        assets_num=ov.get("assetsNum", 0) or 0,
        detection_num=ov.get("detectionNum", 0) or 0,
        flaw_num=ov.get("flawNum", 0) or 0,
        flaw_high_num=ov.get("flawHighNum", 0) or 0,
        flaw_middle_num=ov.get("flawMiddleNum", 0) or 0,
        flaw_low_num=ov.get("flawLowNum", 0) or 0,
    )

    dim = data.get("dataStatisticsDimensionVO", {}) or {}
    trend = AppTestStatTrend(
        date_list=dim.get("dateList", []) or [],
        score_list=dim.get("scoreList", []) or [],
        score_type=dim.get("scoreType", []) or [],
    )

    risk_top10 = []
    for it in (data.get("dataStatisticsRiskItemTop10List") or []):
        if not isinstance(it, dict):
            continue
        grade = it.get("grade")
        grade_name = grade.get("name", "") if isinstance(grade, dict) else (str(grade) if grade else "")
        risk_top10.append(AppTestStatRiskItem(
            name=it.get("name", "") or "",
            grade=grade_name,
            risk_num=it.get("riskNum", 0) or 0,
            rate=it.get("rate"),
            type_name=it.get("typeName", "") or "",
        ))

    risk_types = []
    for it in (data.get("dataStatisticsRiskTypeVOList") or []):
        if not isinstance(it, dict):
            continue
        risk_types.append(AppTestStatRiskType(
            name=it.get("name", "") or it.get("typeName", "") or "",
            count=it.get("count", 0) or it.get("riskNum", 0) or 0,
        ))

    return AppTestStatisticsResponse(
        overview=overview, trend=trend, risk_top10=risk_top10, risk_types=risk_types
    )


# ------------------------------------------------------------------
# Rich task detail (base info, permissions, SDKs, behaviors)
# ------------------------------------------------------------------
async def get_task_detail(db: AsyncSession, task_id: str) -> AppTestTaskDetailResponse:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.document_id:
        raise HTTPException(status_code=400, detail="Task has no document_id yet")

    try:
        client = get_ijiami_client()
        result = await client.get_task_detail(task.document_id, terminal_type=task.terminal_type)
    except IJiamiError as exc:
        raise HTTPException(status_code=502, detail=f"iJiami API error: {exc}")

    data = result.get("data", {}) or {}
    bm = data.get("baseMessageVO", {}) or {}
    base_info = AppTestBaseInfo(
        app_name=bm.get("appName", "") or "",
        package_name=bm.get("packageName", "") or "",
        apk_size=bm.get("apkSize", "") or "",
        version_name=bm.get("versionName", "") or "",
        apk_md5=bm.get("apkMd5", "") or "",
        sign_md5=bm.get("signMd5", "") or "",
        sign_detail=bm.get("signDetail", "") or "",
        encrypt_detail=bm.get("encryptDetail", "") or "",
        manufacturer=bm.get("manufacturer"),
    )

    permissions = []
    sensitive_count = 0
    for p in (data.get("resultPermissionVOList") or []):
        if not isinstance(p, dict):
            continue
        is_sensitive = str(p.get("isSensitive", "") or "")
        if is_sensitive == "是":
            sensitive_count += 1
        permissions.append(AppTestPermission(
            permission_name=p.get("permissionName", "") or "",
            permission_describe=p.get("permissionDescribe", "") or "",
            permission_grade=p.get("permissionGrade", "") or "",
            permission_type=p.get("permissionType"),
            is_sensitive=is_sensitive,
            is_abuse=str(p.get("isAbuse", "") or ""),
        ))

    sdks = []
    for s in (data.get("sdkVOList") or []):
        if not isinstance(s, dict):
            continue
        sdks.append(AppTestSDK(
            name=s.get("name", "") or "",
            vendor=s.get("vendor", "") or "",
            descript=s.get("descript", "") or "",
            type_name=s.get("typeName", "") or "",
            description=s.get("description", "") or "",
        ))

    app_actions = []
    for a in (data.get("appActionVOList") or []):
        if not isinstance(a, dict):
            continue
        app_actions.append(AppTestAppAction(
            name=a.get("name", "") or "",
            action_function=a.get("actionFunction", "") or "",
            action_function_position=a.get("actionFunctionPosition", "") or "",
        ))

    item_types = [
        it.get("typeName", "") for it in (data.get("detectionItemTypeList") or [])
        if isinstance(it, dict) and it.get("typeName")
    ]

    return AppTestTaskDetailResponse(
        is_sdk_detection=data.get("isSdkDetection", 0) or 0,
        base_info=base_info,
        permissions=permissions,
        sdks=sdks,
        app_actions=app_actions,
        item_types=item_types,
        permission_count=len(permissions),
        sdk_count=len(sdks),
        sensitive_permission_count=sensitive_count,
    )


# ------------------------------------------------------------------
# Version history
# ------------------------------------------------------------------
async def get_version_history(db: AsyncSession, task_id: str) -> AppTestVersionHistoryResponse:
    result = await db.execute(select(AppTestTask).where(AppTestTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    terminal_type = str(task.terminal_type)
    client = get_ijiami_client()
    # iJiami returns a business error (not 200) when an app has no version
    # history yet. Treat that as "empty" rather than a hard failure.
    versions_resp: dict[str, Any] = {}
    summary_resp: dict[str, Any] = {}
    try:
        versions_resp = await client.find_all_versions(
            terminal_type=terminal_type,
            package_name=task.package_name or None,
            app_name=task.name or None,
            app_md5=task.md5 or None,
        )
    except IJiamiError as exc:
        logger.info("apptest version history (versions) empty for %s: %s", task_id, exc)
    try:
        summary_resp = await client.summarize_detection_result(
            terminal_type=terminal_type,
            package_name=task.package_name or None,
            app_name=task.name or None,
            app_md5=task.md5 or None,
        )
    except IJiamiError as exc:
        logger.info("apptest version history (summary) empty for %s: %s", task_id, exc)

    versions = versions_resp.get("data", []) or []
    if not isinstance(versions, list):
        versions = []

    sd = summary_resp.get("data", {}) or {}
    scores = []
    for s in (sd.get("singleVersionScoreVOList") or []):
        if not isinstance(s, dict):
            continue
        scores.append(AppTestVersionScore(
            version=s.get("version", "") or "",
            score=s.get("score"),
            create_time=s.get("creatTime", "") or s.get("createTime", "") or "",
        ))

    risks = []
    for r in (sd.get("singleVersionRiskCountVOList") or []):
        if not isinstance(r, dict):
            continue
        risks.append(AppTestVersionRisk(
            app_name=r.get("appName", "") or "",
            version=r.get("version", "") or "",
            apk_highrisk_count=r.get("apk_highrisk_count", 0) or 0,
            apk_middlerisk_count=r.get("apk_middlerisk_count", 0) or 0,
            apk_lowrisk_count=r.get("apk_lowrisk_count", 0) or 0,
            score=r.get("score"),
            create_time=r.get("creatTime", "") or r.get("createTime", "") or "",
        ))

    return AppTestVersionHistoryResponse(scores=scores, risks=risks, versions=versions)
