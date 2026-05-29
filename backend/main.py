"""
PTTechAI v3 - FastAPI Main Application
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from backend.common.config import settings
from backend.api.v1.routes import register_v1_routers
from backend.api.websocket import manager as ws_manager
from backend.app_lifecycle import shutdown_app, startup_app


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

    llm_status = "not_configured"
    llm_provider = None

    if anthropic_key and anthropic_key not in ["", "your-anthropic-api-key"]:
        llm_status = "configured"
        llm_provider = "claude"
    elif openai_key and openai_key not in ["", "your-openai-api-key"]:
        llm_status = "configured"
        llm_provider = "openai"

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
async def websocket_scan(websocket: WebSocket, scan_id: str):
    """WebSocket endpoint for real-time scan updates"""
    await ws_manager.connect(websocket, scan_id)
    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()
            # Handle client commands (pause, resume, etc.)
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, scan_id)


# Serve static files (frontend) in production
frontend_build = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_build.exists():
    app.mount("/assets", StaticFiles(directory=frontend_build / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes"""
        file_path = frontend_build / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_build / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
