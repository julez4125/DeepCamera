"""Configuration loading for the Re-ID linking worker."""

from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional, Union


def _parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"Cannot parse boolean value: {value!r}")


def _parse_float(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    return float(value)


def _parse_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def _parse_csv(value: Any) -> tuple[str, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, (list, tuple)):
        return tuple(str(item).strip() for item in value if str(item).strip())
    return tuple(item.strip() for item in str(value).split(",") if item.strip())


def _parse_toml_value(raw_value: str) -> Any:
    text = raw_value.strip()
    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        return ast.literal_eval(text)
    except Exception:
        if text.startswith('"') and text.endswith('"'):
            return text[1:-1]
        if text.startswith("'") and text.endswith("'"):
            return text[1:-1]
        return text


def _read_toml_mapping(path: Path) -> dict[str, Any]:
    root: dict[str, Any] = {}
    current: dict[str, Any] = root
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "#" in line:
            line = line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].strip()
            current = root.setdefault(section, {})
            if not isinstance(current, dict):
                raise ValueError(f"Invalid TOML section: {section}")
            continue
        key, separator, value = line.partition("=")
        if not separator:
            raise ValueError(f"Invalid TOML line: {raw_line!r}")
        current[key.strip()] = _parse_toml_value(value)
    return root


def _read_mapping_from_path(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    if path.suffix.lower() in {".toml", ".tml"}:
        return _read_toml_mapping(path)
    raise ValueError(f"Unsupported config format: {path.suffix}")


@dataclass(frozen=True)
class ReIdConfig:
    """Runtime configuration for the Re-ID worker."""

    backend: str = "deterministic"
    model_name: str = "reid-cross-camera-linker"
    model_version: str = "v1"
    endpoint_url: Optional[str] = None
    request_timeout_seconds: float = 10.0
    allow_external_backends: bool = True
    fallback_seed: str = "ainvr-reid-linker"
    similarity_threshold: float = 0.72
    appearance_weight: float = 0.42
    motion_weight: float = 0.18
    temporal_weight: float = 0.18
    camera_weight: float = 0.12
    metadata_weight: float = 0.10
    max_history_tracks: int = 128
    max_links_per_track: int = 3
    max_transition_seconds: int = 900
    max_route_hops: int = 3
    allowed_track_kinds: tuple[str, ...] = ("person", "vehicle")

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "ReIdConfig":
        backend = str(mapping.get("backend", cls.backend)).strip() or cls.backend
        return cls(
            backend=backend,
            model_name=str(mapping.get("model_name", cls.model_name)),
            model_version=str(mapping.get("model_version", cls.model_version)),
            endpoint_url=mapping.get("endpoint_url") or None,
            request_timeout_seconds=max(
                0.1,
                _parse_float(mapping.get("request_timeout_seconds"), cls.request_timeout_seconds),
            ),
            allow_external_backends=_parse_bool(
                mapping.get("allow_external_backends"),
                cls.allow_external_backends,
            ),
            fallback_seed=str(mapping.get("fallback_seed", cls.fallback_seed)),
            similarity_threshold=min(
                1.0,
                max(
                    0.0,
                    _parse_float(mapping.get("similarity_threshold"), cls.similarity_threshold),
                ),
            ),
            appearance_weight=max(
                0.0,
                _parse_float(mapping.get("appearance_weight"), cls.appearance_weight),
            ),
            motion_weight=max(0.0, _parse_float(mapping.get("motion_weight"), cls.motion_weight)),
            temporal_weight=max(
                0.0,
                _parse_float(mapping.get("temporal_weight"), cls.temporal_weight),
            ),
            camera_weight=max(0.0, _parse_float(mapping.get("camera_weight"), cls.camera_weight)),
            metadata_weight=max(
                0.0,
                _parse_float(mapping.get("metadata_weight"), cls.metadata_weight),
            ),
            max_history_tracks=max(
                1,
                _parse_int(mapping.get("max_history_tracks"), cls.max_history_tracks),
            ),
            max_links_per_track=max(
                1,
                _parse_int(mapping.get("max_links_per_track"), cls.max_links_per_track),
            ),
            max_transition_seconds=max(
                1,
                _parse_int(mapping.get("max_transition_seconds"), cls.max_transition_seconds),
            ),
            max_route_hops=max(1, _parse_int(mapping.get("max_route_hops"), cls.max_route_hops)),
            allowed_track_kinds=_parse_csv(mapping.get("allowed_track_kinds"))
            or cls.allowed_track_kinds,
        )


@dataclass(frozen=True)
class WorkerConfig:
    """Top-level worker configuration."""

    reid: ReIdConfig = field(default_factory=ReIdConfig)
    worker_name: str = "ainvr-reid-linker"
    queue_name: str = "reid-linking"
    log_level: str = "info"
    source_name: str = "reid-linking-engine"

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "WorkerConfig":
        reid_mapping: Mapping[str, Any]
        if isinstance(mapping.get("reid"), Mapping):
            reid_mapping = mapping["reid"]
        else:
            reid_mapping = mapping
        return cls(
            reid=ReIdConfig.from_mapping(reid_mapping),
            worker_name=str(mapping.get("worker_name", cls.worker_name)),
            queue_name=str(mapping.get("queue_name", cls.queue_name)),
            log_level=str(mapping.get("log_level", cls.log_level)),
            source_name=str(mapping.get("source_name", cls.source_name)),
        )


def _load_env_mapping(env: Mapping[str, str]) -> dict[str, Any]:
    reid = {
        "backend": env.get("AINVR_REID_BACKEND"),
        "model_name": env.get("AINVR_REID_MODEL_NAME"),
        "model_version": env.get("AINVR_REID_MODEL_VERSION"),
        "endpoint_url": env.get("AINVR_REID_URL"),
        "request_timeout_seconds": env.get("AINVR_REID_TIMEOUT_SECONDS"),
        "allow_external_backends": env.get("AINVR_REID_ALLOW_EXTERNAL_BACKENDS"),
        "fallback_seed": env.get("AINVR_REID_FALLBACK_SEED"),
        "similarity_threshold": env.get("AINVR_REID_SIMILARITY_THRESHOLD"),
        "appearance_weight": env.get("AINVR_REID_APPEARANCE_WEIGHT"),
        "motion_weight": env.get("AINVR_REID_MOTION_WEIGHT"),
        "temporal_weight": env.get("AINVR_REID_TEMPORAL_WEIGHT"),
        "camera_weight": env.get("AINVR_REID_CAMERA_WEIGHT"),
        "metadata_weight": env.get("AINVR_REID_METADATA_WEIGHT"),
        "max_history_tracks": env.get("AINVR_REID_MAX_HISTORY_TRACKS"),
        "max_links_per_track": env.get("AINVR_REID_MAX_LINKS_PER_TRACK"),
        "max_transition_seconds": env.get("AINVR_REID_MAX_TRANSITION_SECONDS"),
        "max_route_hops": env.get("AINVR_REID_MAX_ROUTE_HOPS"),
        "allowed_track_kinds": env.get("AINVR_REID_ALLOWED_TRACK_KINDS"),
    }
    return {
        "worker_name": env.get("AINVR_WORKER_NAME"),
        "queue_name": env.get("AINVR_QUEUE_NAME"),
        "log_level": env.get("AINVR_LOG_LEVEL"),
        "source_name": env.get("AINVR_REID_SOURCE_NAME"),
        "reid": reid,
    }


def _merge_non_null(base: dict[str, Any], overlay: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if value is None:
            continue
        if key == "reid" and isinstance(value, Mapping):
            reid = dict(merged.get("reid", {}))
            for reid_key, reid_value in value.items():
                if reid_value is not None:
                    reid[reid_key] = reid_value
            merged["reid"] = reid
            continue
        merged[key] = value
    return merged


def load_worker_config(
    path: Optional[Union[str, Path]] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> WorkerConfig:
    """Load worker configuration from file and environment."""

    env = env or os.environ
    mapping: dict[str, Any] = {}
    config_path_raw = path or env.get("AINVR_REID_CONFIG")
    if config_path_raw:
        config_path = Path(config_path_raw).expanduser()
        if config_path.exists():
            mapping = _read_mapping_from_path(config_path)

    env_mapping = _load_env_mapping(env)
    merged = _merge_non_null(mapping, env_mapping)
    return WorkerConfig.from_mapping(merged)
