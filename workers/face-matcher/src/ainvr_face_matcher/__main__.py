"""Module entrypoint for the face matcher worker."""

from .cli import main

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
