import asyncio
import json
import logging
import re
import subprocess
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Union

logger = logging.getLogger(__name__)


class FFmpegService:
    @staticmethod
    async def probe(filepath: Union[str, Path]) -> dict:
        """Run ffprobe on filepath and return a metadata dict.

        Raises ValueError if ffprobe is missing, times out, exits non-zero,
        or finds no video stream. Runs in a thread pool to avoid blocking.
        """
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            str(filepath),
        ]

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(cmd, capture_output=True, timeout=60)

        try:
            result = await asyncio.to_thread(_run)
        except FileNotFoundError:
            raise ValueError("ffprobe is not installed or not found in PATH.")
        except subprocess.TimeoutExpired:
            raise ValueError("ffprobe timed out while reading the file.")

        if result.returncode != 0:
            error_msg = result.stderr.decode(errors="replace").strip()[:300]
            logger.warning("ffprobe non-zero exit for %s: %s", filepath, error_msg)
            raise ValueError(f"ffprobe could not read the file: {error_msg}" if error_msg else "ffprobe exited with an error.")

        try:
            data = json.loads(result.stdout.decode())
        except json.JSONDecodeError as exc:
            raise ValueError("ffprobe returned unexpected output") from exc

        video_streams = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
        if not video_streams:
            raise ValueError("No video stream found in this file.")

        stream = video_streams[0]
        fmt = data.get("format", {})

        fps: Optional[float] = None
        r_frame_rate = stream.get("r_frame_rate", "")
        if "/" in r_frame_rate:
            num_str, den_str = r_frame_rate.split("/", 1)
            try:
                den = float(den_str)
                fps = float(num_str) / den if den != 0 else None
            except ValueError:
                fps = None

        duration_raw = fmt.get("duration")
        duration = float(duration_raw) if duration_raw else None

        return {
            "duration": duration,
            "width": stream.get("width"),
            "height": stream.get("height"),
            "fps": round(fps, 3) if fps is not None else None,
            "codec": stream.get("codec_name"),
            "format": fmt.get("format_name"),
        }

    @staticmethod
    async def detect_silence(
        filepath: Union[str, Path],
        noise_db: float = -50.0,
        min_duration: float = 0.5,
    ) -> List[Dict[str, float]]:
        """Run FFmpeg silencedetect filter and return a list of silence windows.

        Each window is a dict with keys: start, end, duration (all floats, in seconds).
        Returns an empty list if no silence is detected.
        FFmpeg writes silencedetect output to stderr — stdout is empty.
        """
        cmd = [
            "ffmpeg",
            "-i", str(filepath),
            "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
            "-f", "null",
            "-",
        ]

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(cmd, capture_output=True, timeout=120)

        try:
            result = await asyncio.to_thread(_run)
        except FileNotFoundError:
            raise ValueError("ffmpeg is not installed or not found in PATH.")
        except subprocess.TimeoutExpired:
            raise ValueError("ffmpeg silencedetect timed out.")

        stderr = result.stderr.decode(errors="replace")

        # Parse silence_end and silence_duration lines from stderr.
        # silence_start is derived as end - duration.
        end_matches = re.findall(r"silence_end:\s*([\d.]+)", stderr)
        dur_matches = re.findall(r"silence_duration:\s*([\d.]+)", stderr)

        segments: List[Dict[str, float]] = []
        for end_str, dur_str in zip(end_matches, dur_matches):
            end = float(end_str)
            duration = float(dur_str)
            start = round(end - duration, 6)
            segments.append({"start": round(start, 6), "end": round(end, 6), "duration": round(duration, 6)})

        return segments

    @staticmethod
    async def concat_segments(
        segment_paths: List[Union[str, Path]],
        output_path: Union[str, Path],
    ) -> None:
        """Concatenate video segment files into a single output file.

        Writes a temporary FFmpeg concat list file, runs the concat demuxer
        with stream copy (no re-encode), then removes the list file.
        Raises ValueError on FFmpeg non-zero exit.
        """
        from app.core.config import settings

        list_file = settings.temp_path / f"{uuid.uuid4()}_concat.txt"
        list_lines = [f"file '{Path(p).as_posix()}'" for p in segment_paths]
        list_file.write_text("\n".join(list_lines), encoding="utf-8")

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file.as_posix(),
            "-c", "copy",
            str(output_path),
        ]

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(cmd, capture_output=True, timeout=300)

        try:
            result = await asyncio.to_thread(_run)
        except FileNotFoundError:
            list_file.unlink(missing_ok=True)
            raise ValueError("ffmpeg is not installed or not found in PATH.")
        except subprocess.TimeoutExpired:
            list_file.unlink(missing_ok=True)
            raise ValueError("ffmpeg concat timed out.")
        finally:
            list_file.unlink(missing_ok=True)

        if result.returncode != 0:
            error_msg = result.stderr.decode(errors="replace").strip()[-300:]
            raise ValueError(f"ffmpeg concat failed: {error_msg}")
