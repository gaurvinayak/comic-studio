"""
Pydantic request/response models.

Domain documents (series/characters/parts/pages/panels) are stored as plain
dicts in Mongo and shaped by the service layer; these models cover API request
bodies and a few typed responses. They grow per phase.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

# ── Dev / plumbing (Phase 0) ─────────────────────────────────────────────────


class DevLLMRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    provider: Optional[str] = None  # gemini | anthropic | openai


class DevImageRequest(BaseModel):
    prompt: str = Field(
        default="A friendly cartoon robot mascot waving hello, clean flat vector "
        "style, bright colors, white background, no text."
    )


# ── Shared building blocks (used from Phase 1 on) ────────────────────────────


class Personality(BaseModel):
    traits: list[str] = []
    motivations: Optional[str] = None
    voice: Optional[str] = None  # how they speak / verbal tics


class JobRef(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
