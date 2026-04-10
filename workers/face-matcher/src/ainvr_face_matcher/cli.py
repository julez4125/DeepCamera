"""Command line interface for the face matcher worker."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .config import load_worker_config
from .engine import FaceWorkerEngine
from .events import normalize_face_events
from .models import FrameSample


def _parse_timestamp(value: str) -> datetime:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _load_frames(path: Optional[str]) -> list[FrameSample]:
    if path in {None, "", "-"}:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = [payload]
    return [
        FrameSample(
            frame_id=str(item["frame_id"]),
            timestamp=_parse_timestamp(str(item["timestamp"])),
            tenant_id=str(item["tenant_id"]),
            site_id=str(item["site_id"]),
            camera_id=str(item["camera_id"]),
            width=item.get("width"),
            height=item.get("height"),
            payload=bytes.fromhex(item["payload_hex"]) if item.get("payload_hex") else b"",
            source_uri=item.get("source_uri"),
            correlation_id=item.get("correlation_id"),
            sequence_number=item.get("sequence_number"),
            metadata=dict(item.get("metadata", {})),
        )
        for item in payload
    ]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI-NVR face matcher worker")
    parser.add_argument("--config", help="Path to TOML or JSON worker config")
    parser.add_argument("--frames", help="Path to a JSON array of frame samples")
    parser.add_argument("--warmup", action="store_true", help="Warm up the backends")
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    config = load_worker_config(args.config)
    engine = FaceWorkerEngine(config)
    if args.warmup:
        engine.warmup()

    frames = _load_frames(args.frames)
    if not frames:
        print(json.dumps(engine.snapshot(), sort_keys=True))
        return 0

    for frame in frames:
        batch = engine.process_frame(frame)
        for event in normalize_face_events(batch, worker_config=config):
            print(json.dumps(event, sort_keys=True))
    return 0
