from __future__ import annotations

import logging
from typing import Callable, Dict, Optional

logger = logging.getLogger(__name__)

_model_cache: Dict[str, object] = {}


class TranscriptionService:

    @staticmethod
    def get_model(model_name: str) -> object:
        if model_name not in _model_cache:
            from faster_whisper import WhisperModel
            logger.info("Loading Whisper model '%s' (device=auto)", model_name)
            _model_cache[model_name] = WhisperModel(model_name, device="auto", compute_type="auto")
            logger.info("Whisper model '%s' loaded", model_name)
        return _model_cache[model_name]

    @staticmethod
    def run(
        video_id: str,
        filepath: str,
        duration: Optional[float],
        model_name: str,
        progress_callback: Callable[[int], None],
    ) -> dict:
        model = TranscriptionService.get_model(model_name)

        logger.info("Starting transcription: video_id=%s filepath=%s", video_id, filepath)
        segments_gen, info = model.transcribe(filepath, beam_size=5)  # type: ignore[union-attr]

        collected_segments = []
        pulse_count = 0

        for segment in segments_gen:
            collected_segments.append({
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
            })

            if duration and duration > 0:
                pct = min(99, int(segment.end / duration * 100))
            else:
                pulse_count += 1
                pct = 10 + (pulse_count % 9) * 10  # cycles 10→90

            progress_callback(pct)

        full_text = " ".join(s["text"] for s in collected_segments)
        language = getattr(info, "language", None)

        logger.info(
            "Transcription complete: video_id=%s segments=%d language=%s",
            video_id,
            len(collected_segments),
            language,
        )

        return {
            "text": full_text,
            "segments": collected_segments,
            "language": language,
        }
