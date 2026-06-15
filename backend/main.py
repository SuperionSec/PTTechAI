"""
PTTechAI v3 - FastAPI Main Application
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from backend.common.config import settings
from backend.routes import register_v1_routers
from backend.pentest.backend.api.websocket import manager as ws_manager
from backend.app_lifecycle import shutdown_app, startup_app
from backend.common.infra.auth import decode_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    await startup_app(app)
    yield
    await shutdown_app(app)


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="PTTechAI渗透测试系统 - AI-Powered Penetration Testing Platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
register_v1_routers(app)


@app.get("/api/health")
async def health_check():
    """Health check endpoint with LLM status"""
    import os

    # Check LLM availability
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    llm_status = "not_configured"
    llm_provider = None

    if anthropic_key and anthropic_key not in ["", "your-anthropic-api-key"]:
        llm_status = "configured"
        llm_provider = "claude"
    elif openai_key and openai_key not in ["", "your-openai-api-key"]:
        llm_status = "configured"
        llm_provider = "openai"
    elif openrouter_key and openrouter_key not in ["", "your-openrouter-api-key"]:
        llm_status = "configured"
        llm_provider = "openrouter"
    elif gemini_key and gemini_key not in ["", "your-gemini-api-key"]:
        llm_status = "configured"
        llm_provider = "gemini"

    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm": {
            "status": llm_status,
            "provider": llm_provider,
            "message": "AI agent ready" if llm_status == "configured" else "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable AI features"
        }
    }


@app.websocket("/ws/scan/{scan_id}")
async def websocket_scan(websocket: WebSocket, scan_id: str, token: str = ""):
    """WebSocket endpoint for real-time scan updates with JWT authentication."""
    # Verify JWT token from query parameter
    if token:
        try:
            payload = decode_token(token)
            if payload is None:
                await websocket.close(code=4001, reason="Invalid token")
                return
        except Exception:
            await websocket.close(code=4001, reason="Authentication failed")
            return
    else:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    await ws_manager.connect(websocket, scan_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, scan_id)


@app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def api_not_found(full_path: str):
    """Return 404 for unknown API routes before frontend catch-all."""
    raise HTTPException(status_code=404, detail="API route not found")


# Serve static files (frontend) in production
frontend_build = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_build.exists():
    frontend_root = frontend_build.resolve()
    assets_dir = frontend_build / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes."""
        requested_path = (frontend_root / full_path).resolve()
        if requested_path.is_file() and requested_path.is_relative_to(frontend_root):
            return FileResponse(requested_path)
        return FileResponse(frontend_root / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
