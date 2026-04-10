"""Configuration loading for the face matcher worker."""

from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional, Union

from .models import FaceProfile


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


def _parse_profiles(value: Any) -> tuple[FaceProfile, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, Mapping):
        value = [value]
    profiles: list[FaceProfile] = []
    for index, item in enumerate(value):
        if not isinstance(item, Mapping):
            raise ValueError("profiles must be mapping values")
        profiles.append(
            FaceProfile(
                profile_id=str(item.get("profile_id", f"profile-{index}")),
                display_name=str(item.get("display_name", f"Profile {index}")),
                reference_key=str(item.get("reference_key", f"ref-{index}")),
                opt_in=_parse_bool(item.get("opt_in"), True),
                watchlist=str(item.get("watchlist", "none")),
                active=_parse_bool(item.get("active"), True),
                aliases=tuple(str(alias) for alias in item.get("aliases", [])),
                notes=str(item.get("notes", "")),
                tenant_id=str(item["tenant_id"]) if item.get("tenant_id") is not None else None,
                site_id=str(item["site_id"]) if item.get("site_id") is not None else None,
                metadata=dict(item.get("metadata", {})),
            )
        )
    return tuple(profiles)


@dataclass(frozen=True)
class FaceMatcherConfig:
    backend: str = "deterministic"
    model_name: str = "face-recognition-baseline"
    model_version: str = "v1"
    input_fps_limit: float = 6.0
    fallback_seed: str = "ainvr-face-matcher"
    match_threshold: float = 0.84
    min_detection_confidence: float = 0.65
    max_candidates_per_frame: int = 4
    max_matches_per_frame: int = 2
    require_opt_in: bool = True
    allow_external_backends: bool = False
    max_profiles_considered: int = 256
    profiles: tuple[FaceProfile, ...] = ()

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "FaceMatcherConfig":
        return cls(
            backend=str(mapping.get("backend", cls.backend)).strip() or cls.backend,
            model_name=str(mapping.get("model_name", cls.model_name)),
            model_version=str(mapping.get("model_version", cls.model_version)),
            input_fps_limit=max(0.0, _parse_float(mapping.get("input_fps_limit"), cls.input_fps_limit)),
            fallback_seed=str(mapping.get("fallback_seed", cls.fallback_seed)),
            match_threshold=min(1.0, max(0.0, _parse_float(mapping.get("match_threshold"), cls.match_threshold))),
            min_detection_confidence=min(
                1.0,
                max(0.0, _parse_float(mapping.get("min_detection_confidence"), cls.min_detection_confidence)),
            ),
            max_candidates_per_frame=max(
                1,
                _parse_int(mapping.get("max_candidates_per_frame"), cls.max_candidates_per_frame),
            ),
            max_matches_per_frame=max(
                1,
                _parse_int(mapping.get("max_matches_per_frame"), cls.max_matches_per_frame),
            ),
            require_opt_in=_parse_bool(
                mapping.get("require_opt_in", mapping.get("opt_in_only")),
                cls.require_opt_in,
            ),
            allow_external_backends=_parse_bool(
                mapping.get("allow_external_backends"),
                cls.allow_external_backends,
            ),
            max_profiles_considered=max(
                1,
                _parse_int(mapping.get("max_profiles_considered"), cls.max_profiles_considered),
            ),
            profiles=_parse_profiles(mapping.get("profiles")),
        )


FaceRecognitionConfig = FaceMatcherConfig


@dataclass(frozen=True)
class WorkerConfig:
    face: FaceMatcherConfig = field(default_factory=FaceMatcherConfig)
    worker_name: str = "ainvr-face-matcher"
    event_type: str = "face.matched"
    log_level: str = "info"
    source_name: str = "face-recognition-pipeline"

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "WorkerConfig":
        face_mapping = mapping["face"] if isinstance(mapping.get("face"), Mapping) else mapping
        return cls(
            face=FaceMatcherConfig.from_mapping(face_mapping),
            worker_name=str(mapping.get("worker_name", cls.worker_name)),
            event_type=str(mapping.get("event_type", cls.event_type)),
            log_level=str(mapping.get("log_level", cls.log_level)),
            source_name=str(mapping.get("source_name", cls.source_name)),
        )


def _load_env_mapping(env: Mapping[str, str]) -> dict[str, Any]:
    face = {
        "backend": env.get("AINVR_FACE_BACKEND"),
        "model_name": env.get("AINVR_FACE_MODEL_NAME"),
        "model_version": env.get("AINVR_FACE_MODEL_VERSION"),
        "input_fps_limit": env.get("AINVR_FACE_INPUT_FPS_LIMIT"),
        "fallback_seed": env.get("AINVR_FACE_FALLBACK_SEED"),
        "match_threshold": env.get("AINVR_FACE_MATCH_THRESHOLD"),
        "min_detection_confidence": env.get("AINVR_FACE_MIN_DETECTION_CONFIDENCE"),
        "max_candidates_per_frame": env.get("AINVR_FACE_MAX_CANDIDATES_PER_FRAME"),
        "max_matches_per_frame": env.get("AINVR_FACE_MAX_MATCHES_PER_FRAME"),
        "require_opt_in": env.get("AINVR_FACE_REQUIRE_OPT_IN"),
        "allow_external_backends": env.get("AINVR_FACE_ALLOW_EXTERNAL_BACKENDS"),
        "max_profiles_considered": env.get("AINVR_FACE_MAX_PROFILES_CONSIDERED"),
    }
    return {
        "worker_name": env.get("AINVR_WORKER_NAME"),
        "event_type": env.get("AINVR_FACE_EVENT_TYPE"),
        "log_level": env.get("AINVR_LOG_LEVEL"),
        "source_name": env.get("AINVR_FACE_SOURCE_NAME"),
        "face": face,
    }


def _merge_non_null(base: dict[str, Any], overlay: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if value is None:
            continue
        if key == "face" and isinstance(value, Mapping):
            face = dict(merged.get("face", {}))
            for face_key, face_value in value.items():
                if face_value is not None:
                    face[face_key] = face_value
            merged["face"] = face
            continue
        merged[key] = value
    return merged


def load_worker_config(
    path: Optional[Union[str, Path]] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> WorkerConfig:
    env = env or os.environ
    mapping: dict[str, Any] = {}
    config_path_raw = path or env.get("AINVR_FACE_CONFIG")
    if config_path_raw:
        config_path = Path(config_path_raw).expanduser()
        if config_path.exists():
            mapping = _read_mapping_from_path(config_path)

    env_mapping = _load_env_mapping(env)
    merged = _merge_non_null(mapping, env_mapping)
    return WorkerConfig.from_mapping(merged)
