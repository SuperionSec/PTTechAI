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
    """Minimal public health check endpoint."""
    return {"status": "ok"}


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
