from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import auth, logs, profile, gamification, content, push, sensor, ai, pilot, ws, admin
app.include_router(auth.router)
app.include_router(logs.router)
app.include_router(profile.router)
app.include_router(gamification.router)
app.include_router(content.router)
app.include_router(push.router)
app.include_router(sensor.router)
app.include_router(ai.router)
app.include_router(pilot.router)
app.include_router(ws.router)
app.include_router(admin.router)

@app.get("/healthz", include_in_schema=False)
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
