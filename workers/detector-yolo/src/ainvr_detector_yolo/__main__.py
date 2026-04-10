"""Module entrypoint for `python -m ainvr_detector_yolo`."""

from .cli import main


if __name__ == "__main__":  # pragma: no cover - module entrypoint.
    raise SystemExit(main())

