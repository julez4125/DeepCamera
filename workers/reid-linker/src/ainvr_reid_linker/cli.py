"""Command line interface for the Re-ID linker worker."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .config import load_worker_config
from .engine import ReIdLinkingEngine
from .events import normalize_reid_events
from .models import ReIdTrackSample


def _parse_timestamp(value: str) -> datetime:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _load_tracks(path: Optional[str]) -> list[ReIdTrackSample]:
    if path in {None, "", "-"}:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = [payload]
    tracks: list[ReIdTrackSample] = []
    for item in payload:
        timestamp = _parse_timestamp(str(item["timestamp"]))
        tracks.append(
            ReIdTrackSample(
                track_id=str(item.get("track_id", item.get("frame_id"))),
                tenant_id=str(item["tenant_id"]),
                site_id=str(item["site_id"]),
                camera_id=str(item["camera_id"]),
                observed_at=timestamp,
                last_seen_at=_parse_timestamp(str(item.get("last_seen_at", item["timestamp"]))),
                kind=str(item.get("kind", "person")),
                label=item.get("label"),
                appearance_signature=tuple(item.get("appearance_signature", ())),
                motion_signature=tuple(item.get("motion_signature", ())),
                tags=tuple(item.get("tags", ())),
                candidate_camera_ids=tuple(item.get("candidate_camera_ids", ())),
                metadata=dict(item.get("metadata", {})),
            )
        )
    return tracks


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI-NVR Re-ID linker worker")
    parser.add_argument("--config", help="Path to TOML or JSON worker config")
    parser.add_argument("--tracks", help="Path to a JSON array of track samples")
    parser.add_argument("--warmup", action="store_true", help="Warm up the backends")
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    config = load_worker_config(args.config)
    engine = ReIdLinkingEngine(config)
    if args.warmup:
        engine.warmup()

    tracks = _load_tracks(args.tracks)
    if not tracks:
        print(json.dumps(engine.snapshot(), sort_keys=True))
        return 0

    for track in tracks:
        job = engine.process_job(engine.submit_track(track))
        for event in normalize_reid_events(job, worker_config=config):
            print(json.dumps(event, sort_keys=True))
    return 0
