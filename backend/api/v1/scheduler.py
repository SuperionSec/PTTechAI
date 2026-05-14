"""
PTTechAI v3 - Scheduler API Router

CRUD endpoints for managing scheduled scan jobs.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict

from backend.core.auth import get_current_user
from backend.models.user import User, Role
from fastapi import HTTPException

router = APIRouter()

async def require_non_service_role_scheduler(current_user: User = Depends(get_current_user)) -> User:
    """Block SERVICE role from accessing scheduler endpoints"""
    user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
    if user_role == Role.SERVICE.value:
        raise HTTPException(
            status_code=403,
            detail="Service role is not authorized for this endpoint"
        )
    return current_user

CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "config.json"


class ScheduleJobRequest(BaseModel):
    """Request model for creating a scheduled job."""
    job_id: str
    target: str
    scan_type: str = "quick"
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    agent_role: Optional[str] = None
    llm_profile: Optional[str] = None


class ScheduleJobResponse(BaseModel):
    """Response model for a scheduled job."""
    id: str
    target: str
    scan_type: str
    schedule: str
    status: str
    next_run: Optional[str] = None
    last_run: Optional[str] = None
    run_count: int = 0


@router.get("/", response_model=List[Dict], dependencies=[Depends(require_non_service_role_scheduler)])
async def list_scheduled_jobs(request: Request, current_user: User = Depends(get_current_user)):
    """List all scheduled scan jobs."""
    scheduler = getattr(request.app.state, 'scheduler', None)
    if not scheduler:
        return []
    return scheduler.list_jobs()


@router.post("/", response_model=Dict, dependencies=[Depends(require_non_service_role_scheduler)])
async def create_scheduled_job(job: ScheduleJobRequest, request: Request, current_user: User = Depends(get_current_user)):
    """Create a new scheduled scan job."""
    scheduler = getattr(request.app.state, 'scheduler', None)
    if not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    if not job.cron_expression and not job.interval_minutes:
        raise HTTPException(
            status_code=400,
            detail="Either cron_expression or interval_minutes must be provided"
        )

    result = scheduler.add_job(
        job_id=job.job_id,
        target=job.target,
        scan_type=job.scan_type,
        cron_expression=job.cron_expression,
        interval_minutes=job.interval_minutes,
        agent_role=job.agent_role,
        llm_profile=job.llm_profile
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.delete("/{job_id}", dependencies=[Depends(require_non_service_role_scheduler)])
async def delete_scheduled_job(job_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Delete a scheduled scan job."""
    scheduler = getattr(request.app.state, 'scheduler', None)
    if not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    success = scheduler.remove_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    return {"message": f"Job '{job_id}' deleted", "id": job_id}


@router.post("/{job_id}/pause", dependencies=[Depends(require_non_service_role_scheduler)])
async def pause_scheduled_job(job_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Pause a scheduled scan job."""
    scheduler = getattr(request.app.state, 'scheduler', None)
    if not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    success = scheduler.pause_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    return {"message": f"Job '{job_id}' paused", "id": job_id, "status": "paused"}


@router.post("/{job_id}/resume", dependencies=[Depends(require_non_service_role_scheduler)])
async def resume_scheduled_job(job_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Resume a paused scheduled scan job."""
    scheduler = getattr(request.app.state, 'scheduler', None)
    if not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    success = scheduler.resume_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    return {"message": f"Job '{job_id}' resumed", "id": job_id, "status": "active"}


@router.get("/agent-roles", response_model=List[Dict], dependencies=[Depends(require_non_service_role_scheduler)])
async def get_agent_roles(current_user: User = Depends(get_current_user)):
    """Return available agent roles from config.json for scheduler dropdown."""
    try:
        if not CONFIG_PATH.exists():
            return []
        config = json.loads(CONFIG_PATH.read_text())
        roles = config.get("agent_roles", {})
        result = []
        for role_id, role_data in roles.items():
            if role_data.get("enabled", True):
                result.append({
                    "id": role_id,
                    "name": role_id.replace("_", " ").title(),
                    "description": role_data.get("description", ""),
                    "tools": role_data.get("tools_allowed", []),
                })
        return result
    except Exception:
        return []
