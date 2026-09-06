"""
test_health_commit.py — /health reports the commit it is running

The point of the field is to verify a deploy from outside, so its failure mode
matters: the first version shelled out to `git rev-parse` and reported
"unknown" in production, because deploy.sh pulls as root while the service runs
as structcalc and git refuses a repository owned by someone else. A check that
fails for reasons of its own looks exactly like a failed deploy.
"""
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main


def test_health_reports_a_commit():
    body = main.health()
    assert body["status"] == "ok"
    assert re.fullmatch(r"[0-9a-f]{7}", body["commit"]), body["commit"]


def test_it_is_the_commit_git_agrees_with():
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(main.__file__))))
    try:
        expected = subprocess.run(
            ["git", "rev-parse", "--short=7", "HEAD"], cwd=repo,
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip()
    except Exception:                      # no git here — the reader still works
        return
    assert main._running_commit() == expected


def test_it_never_raises():
    """Health is unauthenticated and must answer even with .git missing."""
    assert isinstance(main._running_commit(), str)
