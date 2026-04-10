"""Inference backend adapters for VLM enrichment."""

from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from urllib.error import URLError
from urllib.request import Request, urlopen
from typing import Any, Mapping, Optional, Protocol, Sequence, runtime_checkable

from .config import VlmConfig
from .models import (
    VlmCandidate,
    VlmEnrichmentObservation,
    VlmSceneSummary,
    VlmSuspiciousContext,
)


@runtime_checkable
class VlmBackendAdapter(Protocol):
    """Backend interface used by the VLM worker engine."""

    name: str

    def warmup(self) -> None:
        """Prepare the backend for inference."""

    def summarize(self, candidate: VlmCandidate, config: VlmConfig) -> VlmEnrichmentObservation:
        """Run inference and return an observation."""


def _digest_for_candidate(candidate: VlmCandidate, config: VlmConfig) -> bytes:
    payload = "|".join(
        [
            config.fallback_seed,
            candidate.candidate_id,
            candidate.kind,
            candidate.tenant_id,
            candidate.site_id,
            candidate.camera_id,
            candidate.frame_id or "",
            candidate.clip_id or "",
            candidate.incident_id or "",
            candidate.correlation_id or "",
            candidate.media_uri or "",
            candidate.text_context,
            ",".join(candidate.tags),
            json.dumps(dict(candidate.metadata), sort_keys=True, default=str),
            str(candidate.frame_count or 0),
            str(candidate.duration_ms or 0),
            str(len(candidate.payload)),
        ]
    )
    return sha256(payload.encode("utf-8")).digest()


def _discover_keywords(candidate: VlmCandidate) -> tuple[str, ...]:
    tokens: list[str] = []
    raw = " ".join(
        [
            candidate.text_context,
            candidate.media_uri or "",
            " ".join(candidate.tags),
            json.dumps(dict(candidate.metadata), sort_keys=True, default=str),
        ]
    ).lower()
    keyword_map = {
        "person": "person",
        "vehicle": "vehicle",
        "car": "vehicle",
        "door": "door",
        "open": "open",
        "forced": "forced",
        "package": "package",
        "unknown": "unknown",
        "loiter": "loitering",
        "motion": "motion",
        "night": "after-hours",
    }
    for needle, label in keyword_map.items():
        if needle in raw and label not in tokens:
            tokens.append(label)
    return tuple(tokens)


def _summarize_scene(candidate: VlmCandidate, digest: bytes) -> tuple[str, tuple[str, ...], tuple[str, ...]]:
    keywords = _discover_keywords(candidate)
    scene_pool: Sequence[str] = (
        "quiet perimeter",
        "people near an entry point",
        "vehicle activity in the monitored area",
        "package or object movement",
        "doorway interaction with limited motion",
        "low-light activity that merits review",
        "normal scene with little movement",
    )
    entity_pool: Sequence[str] = ("person", "vehicle", "door", "package", "camera")
    pool_index = digest[0] % len(scene_pool)
    entity_count = 1 + digest[1] % 3
    entities = tuple(entity_pool[(digest[index + 2] % len(entity_pool))] for index in range(entity_count))

    if candidate.kind == "clip":
        frames = candidate.frame_count or max(2, 1 + digest[3] % 12)
        duration_ms = candidate.duration_ms or max(1000, 5000 + digest[4] * 40)
        text = (
            f"Clip summary: {scene_pool[pool_index]} across {frames} frames over "
            f"{round(duration_ms / 1000.0, 1)} seconds."
        )
    else:
        text = f"Frame summary: {scene_pool[pool_index]}."

    if candidate.text_context:
        text = f"{text} Context: {candidate.text_context.strip()}"

    if keywords:
        text = f"{text} Keywords: {', '.join(keywords)}."

    return text, keywords, entities


def _derive_suspicious_context(candidate: VlmCandidate, config: VlmConfig, digest: bytes) -> VlmSuspiciousContext:
    keywords = set(_discover_keywords(candidate))
    signals: list[str] = []
    reasons: list[str] = []
    risk = 0.18 + (digest[5] / 255.0) * 0.35

    if candidate.kind == "clip":
        risk += 0.08
        if candidate.frame_count and candidate.frame_count >= 8:
            signals.append("extended_clip")
            reasons.append("the clip spans enough frames to inspect temporal behavior")
            risk += 0.08

    if "after-hours" in keywords:
        signals.append("after_hours_activity")
        reasons.append("activity appears to happen outside normal hours")
        risk += 0.14
    if "motion" in keywords:
        signals.append("motion_change")
        reasons.append("the input mentions motion or motion-like change")
        risk += 0.08
    if "loitering" in keywords:
        signals.append("loitering_pattern")
        reasons.append("the input suggests lingering near a sensitive area")
        risk += 0.13
    if "forced" in keywords or "door" in keywords:
        signals.append("entry_point_attention")
        reasons.append("the scene focuses on a door or possible forced entry")
        risk += 0.12
    if "vehicle" in keywords and candidate.kind == "clip":
        signals.append("vehicle_presence")
        reasons.append("vehicle activity often deserves temporal review")
        risk += 0.04
    if "unknown" in keywords:
        signals.append("unknown_object")
        reasons.append("the scene mentions an unknown or unclassified object")
        risk += 0.06

    if candidate.metadata.get("flagged") is True:
        signals.append("pre_flagged_candidate")
        reasons.append("upstream pipeline already marked this candidate")
        risk += 0.12

    risk = max(0.0, min(1.0, risk))
    suspicious = risk >= config.suspicious_threshold or bool(signals)
    recommended_action = "prioritize_review" if suspicious else "log_for_reference"
    if not reasons:
        reasons.append("no strong suspicious cues were found in the deterministic fallback")
    return VlmSuspiciousContext(
        risk_score=round(risk, 3),
        suspicious=suspicious,
        signals=tuple(dict.fromkeys(signals)),
        reasons=tuple(reasons),
        recommended_action=recommended_action,
    )


@dataclass
class DeterministicFallbackVlmAdapter:
    """Deterministic backend that works without external model packages."""

    name: str = "deterministic-fallback"

    def warmup(self) -> None:
        return None

    def summarize(self, candidate: VlmCandidate, config: VlmConfig) -> VlmEnrichmentObservation:
        digest = _digest_for_candidate(candidate, config)
        summary_text, keywords, entities = _summarize_scene(candidate, digest)
        summary = VlmSceneSummary(
            summary_id=sha256(
                f"{candidate.candidate_id}|{candidate.kind}|{config.fallback_seed}".encode("utf-8")
            ).hexdigest(),
            kind=candidate.kind,
            text=summary_text[: config.max_summary_chars],
            highlights=keywords[:5],
            entity_mentions=entities,
            frame_count=candidate.frame_count,
            duration_ms=candidate.duration_ms,
            generated_at=candidate.created_at,
        )
        suspicious_context = _derive_suspicious_context(candidate, config, digest)
        confidence = round(0.62 + (digest[6] / 255.0) * 0.33, 3)
        return VlmEnrichmentObservation(
            candidate_id=candidate.candidate_id,
            backend_name=self.name,
            model_name=config.model_name,
            model_version=config.model_version,
            summary=summary,
            suspicious_context=suspicious_context,
            confidence=confidence,
            generated_at=candidate.created_at,
            details={
                "fallback": True,
                "keywords": list(keywords),
                "entity_mentions": list(entities),
            },
        )


@dataclass
class HttpJsonVlmAdapter:
    """Optional HTTP backend for a local VLM server."""

    endpoint_url: str
    timeout_seconds: float
    name: str = "http-json-vlm"

    def warmup(self) -> None:
        return None

    def summarize(self, candidate: VlmCandidate, config: VlmConfig) -> VlmEnrichmentObservation:
        payload = {
            "candidate": candidate.to_dict(),
            "model": {
                "name": config.model_name,
                "version": config.model_version,
            },
            "constraints": {
                "max_summary_chars": config.max_summary_chars,
                "suspicious_threshold": config.suspicious_threshold,
            },
        }
        request = Request(
            self.endpoint_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except URLError as exc:  # pragma: no cover - only triggered with a live endpoint.
            raise RuntimeError("VLM endpoint request failed") from exc

        data = json.loads(raw)
        summary = VlmSceneSummary(
            summary_id=str(data.get("summary_id") or candidate.candidate_id),
            kind=candidate.kind,
            text=str(data.get("summary", ""))[: config.max_summary_chars],
            highlights=tuple(_coerce_strings(data.get("highlights"))),
            entity_mentions=tuple(_coerce_strings(data.get("entity_mentions"))),
            frame_count=data.get("frame_count", candidate.frame_count),
            duration_ms=data.get("duration_ms", candidate.duration_ms),
        )
        suspicious_context = VlmSuspiciousContext(
            risk_score=float(data.get("risk_score", 0.0)),
            suspicious=bool(data.get("suspicious", False)),
            signals=tuple(_coerce_strings(data.get("signals"))),
            reasons=tuple(_coerce_strings(data.get("reasons"))),
            recommended_action=str(data.get("recommended_action", "review")),
        )
        return VlmEnrichmentObservation(
            candidate_id=candidate.candidate_id,
            backend_name=self.name,
            model_name=config.model_name,
            model_version=config.model_version,
            summary=summary,
            suspicious_context=suspicious_context,
            confidence=float(data.get("confidence", 0.0)),
            details=dict(data.get("details", {})),
        )


def _coerce_strings(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return [str(value)]


def _backend_is_available(endpoint_url: Optional[str]) -> bool:
    return bool(endpoint_url)


def build_backend_adapter(config: VlmConfig) -> VlmBackendAdapter:
    """Select the best available backend for the runtime."""

    backend = config.backend.strip().lower()
    wants_external = backend in {"auto", "http", "remote", "local"}
    if wants_external and config.allow_external_backends and _backend_is_available(config.endpoint_url):
        return HttpJsonVlmAdapter(
            endpoint_url=str(config.endpoint_url),
            timeout_seconds=config.request_timeout_seconds,
        )
    return DeterministicFallbackVlmAdapter()


def build_fallback_observation(candidate: VlmCandidate, config: VlmConfig) -> VlmEnrichmentObservation:
    """Public helper used by tests and offline workflows."""

    return DeterministicFallbackVlmAdapter().summarize(candidate, config)
