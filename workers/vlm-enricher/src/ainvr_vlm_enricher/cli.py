"""Command line interface for the VLM enrichment worker."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .config import load_worker_config
from .engine import VlmEnrichmentEngine
from .events import normalize_vlm_events
from .models import VlmCandidate


def _parse_timestamp(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    timestamp = datetime.fromisoformat(text)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _load_candidates(path: Optional[str]) -> list[VlmCandidate]:
    if path in {None, "-", ""}:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = [payload]
    candidates: list[VlmCandidate] = []
    for item in payload:
        candidates.append(
            VlmCandidate(
                candidate_id=str(item["candidate_id"]),
                kind=str(item["kind"]),
                tenant_id=str(item["tenant_id"]),
                site_id=str(item["site_id"]),
                camera_id=str(item["camera_id"]),
                created_at=_parse_timestamp(str(item["created_at"]))
                if item.get("created_at")
                else datetime.now(timezone.utc),
                frame_id=item.get("frame_id"),
                clip_id=item.get("clip_id"),
                incident_id=item.get("incident_id"),
                correlation_id=item.get("correlation_id"),
                media_uri=item.get("media_uri"),
                payload=bytes.fromhex(item["payload_hex"]) if item.get("payload_hex") else b"",
                text_context=item.get("text_context", ""),
                frame_count=item.get("frame_count"),
                duration_ms=item.get("duration_ms"),
                tags=tuple(item.get("tags", ())),
                metadata=dict(item.get("metadata", {})),
                priority=int(item.get("priority", 0)),
            )
        )
    return candidates


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI-NVR VLM enrichment worker")
    parser.add_argument("--config", help="Path to TOML or JSON worker config")
    parser.add_argument(
        "--candidates",
        help="Path to a JSON array of VLM candidates",
        default=None,
    )
    parser.add_argument(
        "--warmup",
        action="store_true",
        help="Warm up the backend before processing candidates",
    )
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    config = load_worker_config(args.config)
    engine = VlmEnrichmentEngine(config)
    if args.warmup:
        engine.warmup()

    candidates = _load_candidates(args.candidates)
    if not candidates:
        print(json.dumps(engine.snapshot(), sort_keys=True))
        return 0

    for job in engine.submit_candidates(candidates):
        if job.state == "skipped":
            print(json.dumps(job.to_dict(), sort_keys=True))
            continue
        processed = engine.process_job(job)
        events = normalize_vlm_events(processed, worker_config=config)
        if not events:
            print(json.dumps(processed.to_dict(), sort_keys=True))
            continue
        for event in events:
            print(json.dumps(event, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover - module entrypoint.
    raise SystemExit(main())
