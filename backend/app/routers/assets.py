"""Serve stored assets (generated images, exports) by id."""

from fastapi import APIRouter, HTTPException, Response

from .. import storage

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/{asset_id}")
async def get_asset(asset_id: str):
    data, doc = await storage.read_asset(asset_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return Response(
        content=data,
        media_type=(doc or {}).get("mime", "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
