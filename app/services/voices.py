"""Narration voices a person can pick for their video (Microsoft edge-tts neural voices)."""

VOICES = {
    "aria": ("en-US-AriaNeural", "Aria, American"),
    "guy": ("en-US-GuyNeural", "Guy, American"),
    "neerja": ("en-IN-NeerjaNeural", "Neerja, Indian"),
    "prabhat": ("en-IN-PrabhatNeural", "Prabhat, Indian"),
    "sonia": ("en-GB-SoniaNeural", "Sonia, British"),
}


def tts_name(voice_id: str | None, default: str) -> str:
    """The edge-tts voice for a job; jobs from before voices existed use the configured default."""
    return VOICES[voice_id][0] if voice_id in VOICES else default
