#!/usr/bin/env python3
"""Poll CI status for a phase branch's latest commit (secret-safe).

Usage: python3 scripts/poll_ci.py <branch> [timeout_s]
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env():
    env = {}
    p = ROOT / ".env"
    if p.is_file():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.partition("=")[0], line.partition("=")[2]
                env[k.strip()] = v.strip()
    return env


def main() -> int:
    branch = sys.argv[1]
    timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 420.0
    env = load_env()
    token, repo = env["GITHUB_TOKEN"], env["GITHUB_REPO"]
    hdr = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}

    def api(endpoint):
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}{endpoint}", headers=hdr)
        with urllib.request.urlopen(req) as r:
            return json.load(r)

    deadline = time.time() + timeout
    while time.time() < deadline:
        runs = api(f"/actions/runs?branch={branch}&per_page=5")["workflow_runs"]
        for run in runs:
            if run["head_branch"] == branch:
                if run["status"] != "completed":
                    print(f"run {run['id']} ({run['name']}): {run['status']} — waiting...")
                    time.sleep(15)
                    break
                conclusion = run["conclusion"]
                print(f"run {run['id']} ({run['name']}): {conclusion}")
                if conclusion == "success":
                    print("CI GREEN")
                    return 0
                print(f"CI NOT GREEN: {conclusion}")
                return 1
        else:
            print("no runs yet — waiting...")
            time.sleep(10)
    print("timeout waiting for CI")
    return 2


if __name__ == "__main__":
    sys.exit(main())
