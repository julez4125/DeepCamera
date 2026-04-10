"""Backend adapters for the deterministic Re-ID linker worker."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Optional, Protocol, Sequence, runtime_checkable

from .config import ReIdConfig
from .models import (
    CameraTransitionHint,
    ReIdLinkObservation,
    ReIdMovementHint,
    ReIdObservation,
    ReIdSimilarityScore,
    ReIdTrackSample,
)


def _digest(*parts: str) -> bytes:
    return sha256("|".join(parts).encode("utf-8")).digest()


def _cosine_like(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    if size == 0:
        return 0.0
    distance = sum(abs(left[index] - right[index]) for index in range(size)) / size
    return max(0.0, 1.0 - distance)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


@runtime_checkable
class ReIdBackendAdapter(Protocol):
    name: str

    def warmup(self) -> None:
        ...

    def analyze(
        self,
        track: ReIdTrackSample,
        history: Sequence[ReIdTrackSample],
        config: ReIdConfig,
    ) -> ReIdObservation:
        ...


@dataclass
class DeterministicFallbackReIdAdapter:
    name: str = "deterministic-fallback"

    def warmup(self) -> None:
        return None

    def analyze(
        self,
        track: ReIdTrackSample,
        history: Sequence[ReIdTrackSample],
        config: ReIdConfig,
    ) -> ReIdObservation:
        candidates = [
            candidate
            for candidate in history
            if candidate.tenant_id == track.tenant_id
            and candidate.site_id == track.site_id
            and candidate.track_id != track.track_id
            and candidate.kind in config.allowed_track_kinds
        ]

        scored_links = [
            self._score_candidate(track, candidate, config)
            for candidate in candidates
        ]
        scored_links.sort(
            key=lambda link: (
                link.score.total_score,
                link.transition_hint.confidence,
                link.movement_hint.confidence,
                link.matched_track_id,
            ),
            reverse=True,
        )

        links = tuple(
            link
            for link in scored_links[: config.max_links_per_track]
            if link.score.total_score >= config.similarity_threshold
        )
        best_match = links[0] if links else None
        movement_hint = (
            best_match.movement_hint
            if best_match is not None
            else self._build_movement_hint(track, None, 0.0, config)
        )
        confidence = best_match.score.total_score if best_match is not None else movement_hint.confidence

        return ReIdObservation(
            track_id=track.track_id,
            backend_name=self.name,
            model_name=config.model_name,
            model_version=config.model_version,
            best_match=best_match,
            links=links,
            movement_hint=movement_hint,
            confidence=confidence,
            observed_at=track.last_seen_at,
            candidate_count=len(candidates),
        )

    def _score_candidate(
        self,
        track: ReIdTrackSample,
        candidate: ReIdTrackSample,
        config: ReIdConfig,
    ) -> ReIdLinkObservation:
        appearance_score = _cosine_like(track.appearance_signature, candidate.appearance_signature)
        motion_score = _cosine_like(track.motion_signature, candidate.motion_signature)
        temporal_seconds = abs((track.observed_at - candidate.last_seen_at).total_seconds())
        temporal_window = max(float(config.max_transition_seconds), 1.0)
        temporal_score = _clamp(1.0 - (temporal_seconds / temporal_window))

        same_camera = candidate.camera_id == track.camera_id
        camera_score = 0.95 if same_camera else 1.0 if candidate.camera_id in track.candidate_camera_ids else 0.86

        metadata_score = self._metadata_score(track, candidate)
        weights = {
            "appearance": max(0.0, config.appearance_weight),
            "motion": max(0.0, config.motion_weight),
            "temporal": max(0.0, config.temporal_weight),
            "camera": max(0.0, config.camera_weight),
            "metadata": max(0.0, config.metadata_weight),
        }
        weight_sum = sum(weights.values()) or 1.0
        total_score = (
            appearance_score * weights["appearance"]
            + motion_score * weights["motion"]
            + temporal_score * weights["temporal"]
            + camera_score * weights["camera"]
            + metadata_score * weights["metadata"]
        ) / weight_sum

        transition_hint = self._build_transition_hint(track, candidate, temporal_seconds, total_score)
        movement_hint = self._build_movement_hint(track, candidate, total_score, config)
        matched_signals = tuple(
            signal
            for signal, value in (
                ("appearance", appearance_score),
                ("motion", motion_score),
                ("temporal", temporal_score),
                ("camera", camera_score),
                ("metadata", metadata_score),
            )
            if value >= 0.75
        )
        score = ReIdSimilarityScore(
            appearance_score=appearance_score,
            motion_score=motion_score,
            temporal_score=temporal_score,
            camera_score=camera_score,
            metadata_score=metadata_score,
            total_score=_clamp(total_score),
            matched_signals=matched_signals,
        )
        return ReIdLinkObservation(
            source_track_id=track.track_id,
            matched_track_id=candidate.track_id,
            matched_camera_id=candidate.camera_id,
            score=score,
            transition_hint=transition_hint,
            movement_hint=movement_hint,
        )

    def _metadata_score(self, track: ReIdTrackSample, candidate: ReIdTrackSample) -> float:
        scores = []
        if track.label and candidate.label:
            scores.append(1.0 if track.label.lower() == candidate.label.lower() else 0.35)
        if track.kind and candidate.kind:
            scores.append(1.0 if track.kind.lower() == candidate.kind.lower() else 0.25)
        if track.tags or candidate.tags:
            left = {tag.lower() for tag in track.tags}
            right = {tag.lower() for tag in candidate.tags}
            union = left | right
            scores.append(len(left & right) / len(union) if union else 0.0)
        if not scores:
            return 0.5
        return sum(scores) / len(scores)

    def _build_transition_hint(
        self,
        track: ReIdTrackSample,
        candidate: ReIdTrackSample,
        temporal_seconds: float,
        confidence: float,
    ) -> CameraTransitionHint:
        route = (candidate.camera_id, track.camera_id) if candidate.camera_id != track.camera_id else (track.camera_id,)
        eta_seconds = int(min(max(temporal_seconds, 0.0), 24 * 60 * 60))
        reason = "same_camera_observation" if candidate.camera_id == track.camera_id else "deterministic_route"
        return CameraTransitionHint(
            source_camera_id=candidate.camera_id,
            target_camera_id=track.camera_id,
            route=route,
            confidence=_clamp(confidence),
            eta_seconds=eta_seconds,
            reason=reason,
        )

    def _build_movement_hint(
        self,
        track: ReIdTrackSample,
        candidate: Optional[ReIdTrackSample],
        confidence: float,
        config: ReIdConfig,
    ) -> ReIdMovementHint:
        if candidate is None:
            next_camera_ids = track.candidate_camera_ids or (track.camera_id,)
            return ReIdMovementHint(
                direction="unresolved",
                confidence=_clamp(0.2 if confidence <= 0 else confidence),
                likely_next_camera_ids=tuple(next_camera_ids),
                reasoning=("no_matching_history",),
            )

        direction = "cross_camera_transition" if candidate.camera_id != track.camera_id else "same_camera_revisit"
        next_camera_ids = track.candidate_camera_ids or (track.camera_id,)
        reasoning = (
            "candidate_history_match",
            "candidate_camera_allowed",
        )
        return ReIdMovementHint(
            direction=direction,
            confidence=_clamp(confidence),
            likely_next_camera_ids=tuple(next_camera_ids[: config.max_route_hops]),
            reasoning=reasoning,
        )


def build_backend_adapter(config: ReIdConfig) -> ReIdBackendAdapter:
    if config.backend in {"deterministic", "fallback", "offline", ""}:
        return DeterministicFallbackReIdAdapter()
    if not config.allow_external_backends:
        return DeterministicFallbackReIdAdapter()
    if config.endpoint_url:
        return DeterministicFallbackReIdAdapter()
    return DeterministicFallbackReIdAdapter()


# Backwards-compatible aliases for older local callers.
TrackExtractionBackendAdapter = ReIdBackendAdapter
LinkScoringBackendAdapter = ReIdBackendAdapter
ReIdBackendBundle = ReIdBackendAdapter
DeterministicTrackExtractor = DeterministicFallbackReIdAdapter
DeterministicLinkScorer = DeterministicFallbackReIdAdapter
build_backend_bundle = build_backend_adapter
