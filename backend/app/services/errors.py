"""Custom exception hierarchy (ported/adapted from linkedin-comic)."""


class StudioError(Exception):
    """Base for all studio generation errors."""


class ApiKeyMissingError(StudioError):
    """A required provider API key is not configured."""


class ScriptGenerationError(StudioError):
    """The LLM returned invalid / unparseable JSON."""


class ScriptValidationError(StudioError):
    """Generated JSON is missing required fields."""


class ImageGenerationError(StudioError):
    """Image generation failed — no image part in the response."""


class ContentPolicyError(ImageGenerationError):
    """The model refused generation due to content policy."""


class RateLimitError(StudioError):
    """API rate limit hit; caller may retry with backoff."""


class ModelNotFoundError(StudioError):
    """The requested model does not exist or is not accessible."""
