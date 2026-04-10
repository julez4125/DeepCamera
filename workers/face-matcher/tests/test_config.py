from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_face_matcher.config import WorkerConfig  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_from_mapping_parses_profiles(self) -> None:
        config = WorkerConfig.from_mapping(
            {
                "face": {
                    "match_threshold": 0.9,
                    "profiles": [
                        {
                            "profile_id": "profile-1",
                            "display_name": "Alex Mercer",
                            "reference_key": "employee-2471",
                            "opt_in": True,
                            "watchlist": "escort",
                        }
                    ],
                }
            }
        )

        self.assertEqual(config.face.match_threshold, 0.9)
        self.assertEqual(len(config.face.profiles), 1)
        self.assertTrue(config.face.profiles[0].opt_in)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
