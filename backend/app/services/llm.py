"""
LLM text / JSON generation, provider-agnostic.

`STORY_PROVIDER` selects the backend (gemini | anthropic | openai). Gemini is the
default because that key is already proven; switch to anthropic for richer prose.
`generate_json` wraps text generation with fence-stripping, JSON parsing, optional
schema validation, and a self-correcting retry loop.
"""

import json
import re

from .. import config
from . import errors

_gemini_client = None


def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai

        if not config.GEMINI_API_KEY:
            raise errors.ApiKeyMissingError("GEMINI_API_KEY is not set")
        _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _gemini_client


def _strip_fences(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


# ── Per-provider text generation ─────────────────────────────────────────────


def _gemini_text(system, user, temperature, json_mode) -> str:
    from google.genai import types

    client = _get_gemini()
    cfg = types.GenerateContentConfig(
        system_instruction=system or None,
        temperature=temperature,
    )
    if json_mode:
        cfg.response_mime_type = "application/json"
    resp = client.models.generate_content(
        model=config.GEMINI_TEXT_MODEL, contents=user, config=cfg
    )
    return resp.text or ""


def _anthropic_text(system, user, temperature, json_mode) -> str:
    import anthropic

    if not config.ANTHROPIC_API_KEY:
        raise errors.ApiKeyMissingError("ANTHROPIC_API_KEY is not set")
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    sys = system or ""
    if json_mode:
        sys = (sys + "\n\nRespond with ONLY a single valid JSON object. "
                     "No markdown fences, no prose.").strip()
    msg = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=4096,
        temperature=temperature,
        system=sys or None,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")


def _openai_text(system, user, temperature, json_mode) -> str:
    from openai import OpenAI

    if not config.OPENAI_API_KEY:
        raise errors.ApiKeyMissingError("OPENAI_API_KEY is not set")
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
    resp = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system or ""},
            {"role": "user", "content": user},
        ],
        **kwargs,
    )
    return resp.choices[0].message.content or ""


_PROVIDERS = {
    "gemini": _gemini_text,
    "anthropic": _anthropic_text,
    "openai": _openai_text,
}


def generate_text(
    system: str | None,
    user: str,
    *,
    temperature: float | None = None,
    provider: str | None = None,
    json_mode: bool = False,
) -> str:
    provider = (provider or config.STORY_PROVIDER).lower()
    temperature = config.SCRIPT_TEMPERATURE if temperature is None else temperature
    fn = _PROVIDERS.get(provider)
    if fn is None:
        raise errors.StudioError(f"Unknown STORY_PROVIDER '{provider}'")
    try:
        return fn(system, user, temperature, json_mode)
    except (errors.ApiKeyMissingError, errors.StudioError):
        raise
    except Exception as e:  # normalise rate-limit / not-found across SDKs
        s = str(e).lower()
        if "429" in s or "quota" in s or "rate" in s:
            raise errors.RateLimitError(str(e)) from e
        if "not found" in s or "404" in s:
            raise errors.ModelNotFoundError(str(e)) from e
        raise errors.ScriptGenerationError(f"LLM call failed: {e}") from e


def generate_json(
    system: str | None,
    user: str,
    *,
    temperature: float | None = None,
    provider: str | None = None,
    validate=None,
) -> dict:
    """Generate + parse JSON, retrying with a corrective nudge on failure."""
    last_error = None
    message = user
    for attempt in range(1, config.MAX_RETRIES + 1):
        raw = generate_text(
            system, message, temperature=temperature, provider=provider, json_mode=True
        )
        try:
            data = json.loads(_strip_fences(raw))
        except json.JSONDecodeError as e:
            last_error = errors.ScriptGenerationError(
                f"Invalid JSON (attempt {attempt}): {e}; raw={raw[:200]}"
            )
            message = user + "\n\nIMPORTANT: Return ONLY a single valid raw JSON object."
            continue

        if validate is not None:
            try:
                validate(data)
            except errors.ScriptValidationError as e:
                last_error = e
                message = (
                    user
                    + f"\n\nIMPORTANT: your previous response failed validation: {e}. "
                    "Fix it and return ONLY the corrected raw JSON."
                )
                continue
        return data

    raise last_error or errors.ScriptGenerationError("JSON generation failed")
