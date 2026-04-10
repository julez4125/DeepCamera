"""Configuration loading for the LPR worker."""

from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional, Union

from .models import WatchlistEntry


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


def _parse_watchlist_entry(value: Any, default_index: int) -> WatchlistEntry:
    if isinstance(value, Mapping):
        name = str(value.get("name", value.get("plate_pattern", f"watchlist-{default_index}")))
        plate_pattern = str(value.get("plate_pattern", value.get("plate", value.get("pattern", ""))))
        aliases = _parse_csv(value.get("aliases"))
        notes = str(value.get("notes", ""))
        severity = str(value.get("severity", "high"))
        active = _parse_bool(value.get("active"), True)
        return WatchlistEntry(
            name=name,
            plate_pattern=plate_pattern,
            severity=severity,
            aliases=aliases,
            notes=notes,
            active=active,
        )

    text = str(value).strip()
    return WatchlistEntry(name=text or f"watchlist-{default_index}", plate_pattern=text)


def _parse_watchlists(value: Any) -> tuple[WatchlistEntry, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, (list, tuple)):
        return tuple(_parse_watchlist_entry(item, index) for index, item in enumerate(value))
    if isinstance(value, Mapping):
        return (_parse_watchlist_entry(value, 0),)
    return tuple(
        _parse_watchlist_entry(item, index)
        for index, item in enumerate(_parse_csv(value))
    )


@dataclass(frozen=True)
class LprConfig:
    """Runtime configuration for the LPR engine."""

    backend: str = "deterministic"
    model_name: str = "plate-detector"
    model_version: str = "v1"
    ocr_engine: str = "deterministic"
    country_hint: str = "generic"
    input_fps_limit: float = 5.0
    plate_min_confidence: float = 0.55
    ocr_min_confidence: float = 0.7
    min_plate_length: int = 4
    max_plate_length: int = 10
    max_plate_candidates_per_frame: int = 4
    max_watchlist_matches_per_read: int = 3
    fallback_seed: str = "ainvr-lpr-reader"
    allow_external_backends: bool = False
    watchlists: tuple[WatchlistEntry, ...] = ()

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "LprConfig":
        backend = str(mapping.get("backend", cls.backend)).strip() or cls.backend
        watchlists = _parse_watchlists(mapping.get("watchlists") or mapping.get("watchlist"))
        min_plate_length = max(1, _parse_int(mapping.get("min_plate_length"), cls.min_plate_length))
        max_plate_length = max(min_plate_length, _parse_int(mapping.get("max_plate_length"), cls.max_plate_length))
        return cls(
            backend=backend,
            model_name=str(mapping.get("model_name", cls.model_name)),
            model_version=str(mapping.get("model_version", cls.model_version)),
            ocr_engine=str(mapping.get("ocr_engine", cls.ocr_engine)),
            country_hint=str(mapping.get("country_hint", cls.country_hint)),
            input_fps_limit=max(0.0, _parse_float(mapping.get("input_fps_limit"), cls.input_fps_limit)),
            plate_min_confidence=min(
                1.0,
                max(0.0, _parse_float(mapping.get("plate_min_confidence"), cls.plate_min_confidence)),
            ),
            ocr_min_confidence=min(
                1.0,
                max(0.0, _parse_float(mapping.get("ocr_min_confidence"), cls.ocr_min_confidence)),
            ),
            min_plate_length=min_plate_length,
            max_plate_length=max_plate_length,
            max_plate_candidates_per_frame=max(
                1,
                _parse_int(
                    mapping.get("max_plate_candidates_per_frame"),
                    cls.max_plate_candidates_per_frame,
                ),
            ),
            max_watchlist_matches_per_read=max(
                1,
                _parse_int(
                    mapping.get("max_watchlist_matches_per_read"),
                    cls.max_watchlist_matches_per_read,
                ),
            ),
            fallback_seed=str(mapping.get("fallback_seed", cls.fallback_seed)),
            allow_external_backends=_parse_bool(
                mapping.get("allow_external_backends"),
                cls.allow_external_backends,
            ),
            watchlists=watchlists,
        )


@dataclass(frozen=True)
class WorkerConfig:
    """Top-level worker configuration."""

    lpr: LprConfig = field(default_factory=LprConfig)
    worker_name: str = "ainvr-lpr-reader"
    event_type: str = "plate.read"
    log_level: str = "info"
    source_name: str = "plate-recognition-pipeline"

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "WorkerConfig":
        lpr_mapping: Mapping[str, Any]
        if isinstance(mapping.get("lpr"), Mapping):
            lpr_mapping = mapping["lpr"]
        else:
            lpr_mapping = mapping
        return cls(
            lpr=LprConfig.from_mapping(lpr_mapping),
            worker_name=str(mapping.get("worker_name", cls.worker_name)),
            event_type=str(mapping.get("event_type", cls.event_type)),
            log_level=str(mapping.get("log_level", cls.log_level)),
            source_name=str(mapping.get("source_name", cls.source_name)),
        )


def _load_env_mapping(env: Mapping[str, str]) -> dict[str, Any]:
    lpr = {
        "backend": env.get("AINVR_LPR_BACKEND"),
        "model_name": env.get("AINVR_LPR_MODEL_NAME"),
        "model_version": env.get("AINVR_LPR_MODEL_VERSION"),
        "ocr_engine": env.get("AINVR_LPR_OCR_ENGINE"),
        "country_hint": env.get("AINVR_LPR_COUNTRY_HINT"),
        "input_fps_limit": env.get("AINVR_LPR_INPUT_FPS_LIMIT"),
        "plate_min_confidence": env.get("AINVR_LPR_PLATE_MIN_CONFIDENCE"),
        "ocr_min_confidence": env.get("AINVR_LPR_OCR_MIN_CONFIDENCE"),
        "min_plate_length": env.get("AINVR_LPR_MIN_PLATE_LENGTH"),
        "max_plate_length": env.get("AINVR_LPR_MAX_PLATE_LENGTH"),
        "max_plate_candidates_per_frame": env.get("AINVR_LPR_MAX_PLATE_CANDIDATES"),
        "max_watchlist_matches_per_read": env.get("AINVR_LPR_MAX_WATCHLIST_MATCHES"),
        "fallback_seed": env.get("AINVR_LPR_FALLBACK_SEED"),
        "allow_external_backends": env.get("AINVR_LPR_ALLOW_EXTERNAL_BACKENDS"),
        "watchlists": env.get("AINVR_LPR_WATCHLISTS") or env.get("AINVR_LPR_WATCHLIST"),
    }
    return {
        "worker_name": env.get("AINVR_WORKER_NAME"),
        "event_type": env.get("AINVR_LPR_EVENT_TYPE"),
        "log_level": env.get("AINVR_LOG_LEVEL"),
        "source_name": env.get("AINVR_LPR_SOURCE_NAME"),
        "lpr": lpr,
    }


def _merge_non_null(base: dict[str, Any], overlay: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if value is None:
            continue
        if key == "lpr" and isinstance(value, Mapping):
            lpr = dict(merged.get("lpr", {}))
            for lpr_key, lpr_value in value.items():
                if lpr_value is not None:
                    lpr[lpr_key] = lpr_value
            merged["lpr"] = lpr
            continue
        merged[key] = value
    return merged


def load_worker_config(
    path: Optional[Union[str, Path]] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> WorkerConfig:
    """Load worker configuration from file and environment variables."""

    env_map = os.environ if env is None else env
    merged: dict[str, Any] = {}

    config_path = path or env_map.get("AINVR_LPR_CONFIG") or env_map.get("AINVR_WORKER_CONFIG")
    if config_path:
        merged = _read_mapping_from_path(Path(config_path))

    merged = _merge_non_null(merged, _load_env_mapping(env_map))
    return WorkerConfig.from_mapping(merged)
