"""
Async generation jobs.

Long-running generation (characters, parts, panel art, exports) runs in a
FastAPI BackgroundTask and reports progress through the `jobs` collection, which
the frontend polls. Adequate for personal scale; swap `run_job` for Celery/RQ if
this ever needs real concurrency.
"""

from typing import Awaitable, Callable

from .. import db
from ..util import clean, new_id, utcnow

JobType = str  # generate_series | generate_character | generate_part | generate_panel | export


async def create_job(job_type: JobType, *, series_id: str | None = None, meta: dict | None = None) -> dict:
    doc = {
        "job_id": new_id("job"),
        "type": job_type,
        "series_id": series_id,
        "status": "queued",
        "progress": 0,
        "result": None,
        "error": None,
        "meta": meta or {},
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    await db.jobs_col().insert_one(doc)
    return clean(doc)


async def update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = utcnow()
    await db.jobs_col().update_one({"job_id": job_id}, {"$set": fields})


async def get_job(job_id: str) -> dict | None:
    return await db.jobs_col().find_one({"job_id": job_id}, {"_id": 0})


async def run_job(job_id: str, work: Callable[[], Awaitable[dict]]) -> None:
    """Execute `work`, recording running/done/error transitions on the job."""
    try:
        await update_job(job_id, status="running")
        result = await work()
        await update_job(job_id, status="done", progress=100, result=result)
    except Exception as e:  # noqa: BLE001 — surface any failure to the poller
        await update_job(job_id, status="error", error=str(e))
