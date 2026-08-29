#!/usr/bin/env python3
"""
Sarvam AI Speech-to-Text transcriber for LONG audio files.

Uses the Sarvam Batch API (saaras:v3) which supports:
  - up to 2 hours per file, up to 20 files per job, up to 20 speakers
  - 23 Indian languages + auto-detect
  - 5 output modes: transcribe, translate, verbatim, translit, codemix
  - optional speaker diarization + word-level timestamps

Auth uses the `api-subscription-key` header (NOT Bearer).
The SDK reads the key from the SARVAM_API_KEY env var automatically.

Usage
-----
  # default: Hindi, transcribe (native Devanagari), 2-speaker diarization
  python3 scripts/transcribe.py /path/to/audio.mp3

  # multiple files in one job
  python3 scripts/transcribe.py a.mp3 b.wav c.m4a

  # override settings
  python3 scripts/transcribe.py audio.mp3 --language en-IN --mode translate --speakers 3 --no-diarize

  # auto-detect language (omit --language)
  python3 scripts/transcribe.py audio.mp3 --speakers 0

  # add word-level timestamps
  python3 scripts/transcribe.py audio.mp3 --timestamps

Outputs (written next to the first audio file):
  <stem>_transcript.txt   — clean human-readable transcript (with speaker tags if diarized)
  <stem>_raw/              — raw JSON/verbose outputs downloaded from Sarvam

Setup
-----
  pip3 install sarvamai pydub
  # ffmpeg must be on PATH (for mp3 splitting of >2h files)
  # put your key in scripts/.env  (SARVAM_API_KEY=...) or export it in your shell
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# --- load .env from scripts/ dir (gitignored) ---------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
_env_file = _SCRIPT_DIR / ".env"
if _env_file.exists() and not os.environ.get("SARVAM_API_KEY"):
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

try:
    from sarvamai import SarvamAI
except ImportError:
    sys.exit("ERROR: sarvamai not installed. Run:  pip3 install sarvamai pydub")

# --- constants ----------------------------------------------------------------
MAX_FILE_SECONDS = 2 * 60 * 60  # Batch API limit: 2 hours per file
CHUNK_MS = MAX_FILE_SECONDS * 1000


def get_audio_duration_seconds(path: Path) -> float:
    """Return duration in seconds via pydub (needs ffmpeg for non-wav)."""
    from pydub import AudioSegment  # local import: slow + needs ffmpeg
    audio = AudioSegment.from_file(str(path))
    return len(audio) / 1000.0


def split_audio(path: Path, out_dir: Path) -> list[Path]:
    """Split audio into <2h mp3 chunks. Returns list of chunk paths (or [path] if short enough)."""
    from pydub import AudioSegment
    audio = AudioSegment.from_file(str(path))
    if len(audio) <= CHUNK_MS:
        return [path]
    out_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    for i in range(0, len(audio), CHUNK_MS):
        chunk = audio[i : i + CHUNK_MS]
        chunk_path = out_dir / f"{path.stem}_part{len(chunks) + 1}.mp3"
        chunk.export(str(chunk_path), format="mp3")
        chunks.append(chunk_path)
        print(f"  split -> {chunk_path.name} ({len(chunk) / 1000:.0f}s)")
    return chunks


def fmt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def build_transcript_from_diarized(data: dict) -> str:
    """Build a clean 'SPEAKER_XX [hh:mm:ss - hh:mm:ss]: text' transcript from diarized JSON.

    Sarvam saaras:v3 diarized output shape:
        {"diarized_transcript": {"entries": [
            {"transcript": "...", "start_time_seconds": 9.59,
             "end_time_seconds": 19.99, "speaker_id": "0"}, ...]}}
    Also tolerates older/alternate keys: transcripts/segments lists,
    speaker/speaker_id, text/transcript, start_time/end_time.
    """
    lines: list[str] = []
    entries = data.get("diarized_transcript")
    if isinstance(entries, dict):
        entries = entries.get("entries") or entries.get("transcripts") or entries.get("segments") or []
    if not entries:
        entries = data.get("transcripts") or data.get("segments") or []
    if isinstance(entries, dict):
        entries = entries.get("transcripts") or entries.get("segments") or entries.get("entries") or []
    for e in entries or []:
        if not isinstance(e, dict):
            continue
        speaker = e.get("speaker") or e.get("speaker_id")
        speaker = f"SPEAKER_{speaker}" if (speaker is not None and not str(speaker).startswith("SPEAKER")) else (speaker or "SPEAKER")
        text = (e.get("transcript") or e.get("text") or "").strip()
        start = e.get("start_time_seconds", e.get("start_time"))
        end = e.get("end_time_seconds", e.get("end_time"))
        ts = f"[{fmt_ts(float(start))} - {fmt_ts(float(end))}] " if start is not None else ""
        if text:
            lines.append(f"{speaker} {ts}{text}")
    return "\n".join(lines) if lines else ""


def build_transcript_from_plain(data: dict) -> str:
    """Build a plain transcript from a non-diarized JSON result."""
    if isinstance(data, dict):
        for k in ("transcript", "transcription", "text"):
            v = data.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, dict):
                inner = v.get("transcript") or v.get("text")
                if isinstance(inner, str) and inner.strip():
                    return inner.strip()
        # verbose/json mode may nest under "segments"
        segs = data.get("segments") or []
        if isinstance(segs, list):
            return "\n".join((s.get("text") or "").strip() for s in segs if isinstance(s, dict) and s.get("text"))
    if isinstance(data, str):
        return data.strip()
    return ""


def find_result_json(raw_dir: Path) -> Path | None:
    """Find the first .json result file in the downloaded outputs dir."""
    for p in sorted(raw_dir.rglob("*.json")):
        return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Transcribe long audio with Sarvam AI Batch STT (saaras:v3).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("audio", nargs="+", help="path(s) to audio file(s) (mp3/wav/m4a/aac/flac/ogg)")
    ap.add_argument("--language", default="hi-IN",
                    help="language code (hi-IN, en-IN, bn-IN, ta-IN, te-IN, kn-IN, mr-IN, ...). "
                         "Use 'unknown' for auto-detect. Default: hi-IN")
    ap.add_argument("--mode", default="transcribe",
                    choices=["transcribe", "translate", "verbatim", "translit", "codemix"],
                    help="output mode. Default: transcribe (native script)")
    ap.add_argument("--speakers", type=int, default=2,
                    help="number of speakers for diarization. Use 0 to disable diarization. Default: 2")
    ap.add_argument("--no-diarize", action="store_true", help="disable speaker diarization")
    ap.add_argument("--timestamps", action="store_true", help="include word-level timestamps")
    ap.add_argument("--model", default="saaras:v3", help="Sarvam STT model. Default: saaras:v3")
    ap.add_argument("--out-dir", help="output directory (default: next to first audio file)")
    args = ap.parse_args()

    api_key = os.environ.get("SARVAM_API_KEY")
    if not api_key:
        sys.exit("ERROR: SARVAM_API_KEY not set. Put it in scripts/.env or export it.")

    audio_paths = [Path(a).expanduser().resolve() for a in args.audio]
    for p in audio_paths:
        if not p.exists():
            sys.exit(f"ERROR: audio file not found: {p}")

    first = audio_paths[0]
    out_dir = Path(args.out_dir).resolve() if args.out_dir else first.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = out_dir / f"{first.stem}_raw"

    do_diarize = (not args.no_diarize) and args.speakers > 0
    num_speakers = args.speakers if do_diarize else None

    print("=" * 70)
    print(f"Sarvam Batch STT  |  model={args.model}  mode={args.mode}")
    print(f"language={args.language}  diarization={do_diarize}"
          + (f"  speakers={num_speakers}" if do_diarize else "")
          + (f"  timestamps={args.timestamps}" if args.timestamps else ""))
    print(f"audio: {len(audio_paths)} file(s)")
    for p in audio_paths:
        print(f"  - {p}")
    print("=" * 70)

    # --- split any file > 2h ---------------------------------------------------
    all_chunks: list[Path] = []
    for p in audio_paths:
        try:
            dur = get_audio_duration_seconds(p)
            print(f"\n[{p.name}] duration = {fmt_ts(dur)}")
        except Exception as e:
            print(f"\n[{p.name}] could not read duration ({e}); sending as-is.")
            all_chunks.append(p)
            continue
        if dur > MAX_FILE_SECONDS:
            print(f"  > 2h limit — splitting into <=2h chunks...")
            all_chunks.extend(split_audio(p, raw_dir))
        else:
            all_chunks.append(p)

    print(f"\nTotal files to upload: {len(all_chunks)}")

    # --- create + run batch job ------------------------------------------------
    client = SarvamAI(api_subscription_key=api_key)
    print("\nCreating batch job...")
    job = client.speech_to_text_job.create_job(
        model=args.model,
        mode=args.mode,
        language_code=args.language if args.language != "unknown" else None,
        with_diarization=do_diarize,
        with_timestamps=args.timestamps,
        num_speakers=num_speakers,
    )
    print(f"  job_id = {job.job_id}")

    print("\nUploading files...")
    job.upload_files(file_paths=[str(c) for c in all_chunks])
    print("  uploaded.")

    print("\nStarting job...")
    job.start()

    print("\nWaiting for completion (this can take several minutes for long audio)...")
    status = job.wait_until_complete(poll_interval=10, timeout=3600)  # up to 1h wait
    print(f"  final status = {status.state if hasattr(status, 'state') else status}")

    if hasattr(job, "is_failed") and job.is_failed():
        sys.exit("ERROR: job failed. Check the Sarvam dashboard or retry.")

    print("\nDownloading outputs...")
    ok = job.download_outputs(output_dir=str(raw_dir))
    print(f"  downloaded -> {raw_dir}")

    # --- build clean transcript ------------------------------------------------
    result_json = find_result_json(raw_dir)
    transcript_text = ""
    if result_json:
        print(f"\nParsing result: {result_json}")
        try:
            data = json.loads(result_json.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  WARN: could not parse JSON ({e}); dumping raw text instead.")
            transcript_text = result_json.read_text(encoding="utf-8")
        else:
            transcript_text = build_transcript_from_diarized(data) if do_diarize else build_transcript_from_plain(data)
            if not transcript_text:
                # fall back to whichever builder yields something
                transcript_text = build_transcript_from_plain(data) or build_transcript_from_diarized(data)
    else:
        # no JSON found — concatenate any .txt outputs
        txts = sorted(raw_dir.rglob("*.txt"))
        if txts:
            transcript_text = "\n".join(t.read_text(encoding="utf-8") for t in txts)

    transcript_path = out_dir / f"{first.stem}_transcript.txt"
    if not transcript_text:
        transcript_text = "(No parseable transcript found — see raw outputs in " + str(raw_dir) + ")"
    transcript_path.write_text(transcript_text + "\n", encoding="utf-8")

    print("\n" + "=" * 70)
    print("DONE")
    print(f"  transcript : {transcript_path}")
    print(f"  raw outputs: {raw_dir}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
