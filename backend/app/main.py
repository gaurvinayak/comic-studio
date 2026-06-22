"""Comic Book Studio — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, db
from .deps import ensure_default_user
from .routers import assets, auth, characters, dev, jobs, pages, parts, series, showcase


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        await db.ensure_indexes()
        await ensure_default_user()
    except Exception as e:  # don't crash boot if Mongo is briefly unavailable
        print(f"[startup] warning: DB init failed: {e}")
    yield


app = FastAPI(title="Comic Book Studio", version="0.1.0", lifespan=lifespan)

_origins = list(
    {
        config.FRONTEND_ORIGIN,
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    }
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dev.router)
app.include_router(auth.router)
app.include_router(assets.router)
app.include_router(jobs.router)
app.include_router(series.router)
app.include_router(characters.router)
app.include_router(parts.router)
app.include_router(pages.router)
app.include_router(showcase.router)


@app.get("/")
async def root():
    return {"service": "comic-studio", "version": "0.1.0", "docs": "/docs"}
