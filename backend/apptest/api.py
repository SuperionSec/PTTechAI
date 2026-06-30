"""FastAPI routes for apptest module."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.permissions import (
    require_apptest_execute,
    require_apptest_manage,
    require_apptest_read,
)
from backend.common.models.user import User

from . import service
from .schemas import (
    AppTestAssetsResponse,
    AppTestConfigResponse,
    AppTestConfigUpdate,
    AppTestConnectionTestResponse,
    AppTestStatisticsResponse,
    AppTestStrategiesResponse,
    AppTestTaskCreate,
    AppTestTaskDetailResponse,
    AppTestTaskListResponse,
    AppTestTaskResponse,
    AppTestTaskStatusResponse,
    AppTestVersionHistoryResponse,
    AppTestVulnsResponse,
)

router = APIRouter(tags=["App Test"])


# ------------------------------------------------------------------
# Statistics
# ------------------------------------------------------------------
@router.get("/statistics", response_model=AppTestStatisticsResponse, dependencies=[Depends(require_apptest_read())])
async def get_statistics(
    dimension: int = Query(3, ge=1, le=3, description="1=day, 2=week, 3=month"),
    terminal_type: int = Query(1, description="1=Android, 2=iOS, 10=HarmonyOS"),
    package_name: str | None = Query(None),
) -> AppTestStatisticsResponse:
    return await service.get_statistics(
        dimension=dimension, terminal_type=terminal_type, package_name=package_name
    )


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
@router.get("/config", response_model=AppTestConfigResponse, dependencies=[Depends(require_apptest_read())])
async def get_config() -> AppTestConfigResponse:
    return await service.get_config()


@router.post("/config", response_model=AppTestConfigResponse, dependencies=[Depends(require_apptest_manage())])
async def update_config(body: AppTestConfigUpdate) -> AppTestConfigResponse:
    return await service.update_config(body)


@router.post("/config/test", response_model=AppTestConnectionTestResponse, dependencies=[Depends(require_apptest_manage())])
async def test_connection(body: AppTestConfigUpdate | None = None) -> AppTestConnectionTestResponse:
    result = await service.test_connection(body)
    return AppTestConnectionTestResponse(**result)


# ------------------------------------------------------------------
# Strategies
# ------------------------------------------------------------------
@router.get("/strategies", response_model=AppTestStrategiesResponse, dependencies=[Depends(require_apptest_read())])
async def list_strategies(
    terminal_type: int | None = Query(None, description="Terminal type filter"),
) -> AppTestStrategiesResponse:
    return await service.list_strategies(terminal_type=terminal_type)


# ------------------------------------------------------------------
# Assets
# ------------------------------------------------------------------
@router.get("/assets", response_model=AppTestAssetsResponse, dependencies=[Depends(require_apptest_read())])
async def list_assets(
    terminal_type: int | None = Query(None),
    app_name: str | None = Query(None),
) -> AppTestAssetsResponse:
    return await service.list_assets(terminal_type=terminal_type, app_name=app_name)


# ------------------------------------------------------------------
# Tasks
# ------------------------------------------------------------------
@router.post("/tasks", response_model=AppTestTaskResponse)
async def create_task(
    name: str = Form(..., description="Application name"),
    terminal_type: int = Form(1, description="Terminal type: 1=Android, 2=iOS, 10=鸿蒙, 12=H5, 8=IoT, 4=小程序, 14=HarmonyOS"),
    template_id: str | None = Form(None, description="Strategy/template ID"),
    template_name: str | None = Form(None),
    callback: bool = Form(False),
    callback_url: str | None = Form(None),
    file: UploadFile = File(..., description="App file to upload (APK/IPA/HAP/etc.)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_apptest_execute()),
) -> AppTestTaskResponse:
    file_content = await file.read()
    # Guard against oversized uploads (whole file is held in memory and forwarded
    # to iJiami). 500 MB covers large APK/IPA/AAB packages with headroom.
    max_bytes = 500 * 1024 * 1024
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="上传文件为空")
    if len(file_content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"文件过大，最大支持 {max_bytes // 1024 // 1024} MB")
    data = AppTestTaskCreate(
        name=name,
        terminal_type=terminal_type,
        template_id=template_id,
        template_name=template_name,
        callback=callback,
        callback_url=callback_url,
    )
    return await service.create_task(
        db=db,
        data=data,
        file_content=file_content,
        filename=file.filename or "unknown",
        user_id=getattr(current_user, "id", None),
    )


@router.get("/tasks", response_model=AppTestTaskListResponse, dependencies=[Depends(require_apptest_read())])
async def list_tasks(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    terminal_type: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> AppTestTaskListResponse:
    return await service.list_tasks(
        db=db,
        page=page,
        per_page=per_page,
        status=status,
        terminal_type=terminal_type,
    )


@router.get("/tasks/{task_id}", response_model=AppTestTaskResponse, dependencies=[Depends(require_apptest_read())])
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> AppTestTaskResponse:
    return await service.get_task(db=db, task_id=task_id)


@router.delete("/tasks/{task_id}", dependencies=[Depends(require_apptest_manage())])
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_task(db=db, task_id=task_id)
    return {"ok": True}


@router.get("/tasks/{task_id}/status", response_model=AppTestTaskStatusResponse, dependencies=[Depends(require_apptest_read())])
async def get_task_status(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> AppTestTaskStatusResponse:
    return await service.get_task_status(db=db, task_id=task_id)


# ------------------------------------------------------------------
# Rich detail & version history
# ------------------------------------------------------------------
@router.get("/tasks/{task_id}/detail", response_model=AppTestTaskDetailResponse, dependencies=[Depends(require_apptest_read())])
async def get_task_detail(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> AppTestTaskDetailResponse:
    return await service.get_task_detail(db=db, task_id=task_id)


@router.get("/tasks/{task_id}/version-history", response_model=AppTestVersionHistoryResponse, dependencies=[Depends(require_apptest_read())])
async def get_version_history(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> AppTestVersionHistoryResponse:
    return await service.get_version_history(db=db, task_id=task_id)


# ------------------------------------------------------------------
# Vulnerabilities
# ------------------------------------------------------------------
@router.get("/tasks/{task_id}/vulns", response_model=AppTestVulnsResponse, dependencies=[Depends(require_apptest_read())])
async def get_task_vulnerabilities(
    task_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(1000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
) -> AppTestVulnsResponse:
    return await service.get_task_vulnerabilities(
        db=db,
        task_id=task_id,
        page=page,
        per_page=per_page,
    )


# ------------------------------------------------------------------
# Reports
# ------------------------------------------------------------------
@router.get("/tasks/{task_id}/report", dependencies=[Depends(require_apptest_read())])
async def download_report(
    task_id: str,
    report_type: int = Query(1, ge=1, le=2, description="1=Word, 2=PDF"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    content, filename = await service.download_report(
        db=db,
        task_id=task_id,
        report_type=report_type,
    )
    media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if report_type == 1 else "application/pdf"
    # RFC 5987 encoding for non-ASCII (e.g. Chinese) filenames in Content-Disposition
    from urllib.parse import quote
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii") or "report"
    encoded = quote(filename)
    disposition = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": disposition},
    )
