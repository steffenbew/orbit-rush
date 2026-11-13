#!/usr/bin/env python3
"""Print a deployment worker pinned to the exact bytes of this checkout."""

import base64
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent


def prepare():
    source = (ROOT / "sw.js").read_text()
    if source.count("const RELEASE = null;") != 1:
        raise ValueError("Expected one unprepared RELEASE marker in sw.js.")
    files = json.loads(re.search(r"const FILES = (\[.*?\]);", source, re.DOTALL).group(1))
    integrity = {}
    for name in files:
        digest = hashlib.sha256((ROOT / name).read_bytes()).digest()
        integrity[name] = "sha256-" + base64.b64encode(digest).decode("ascii")
    # Include the worker itself so a cache-strategy change also gets a new name.
    fingerprint = source + json.dumps(integrity, sort_keys=True)
    release = {
        "id": hashlib.sha256(fingerprint.encode()).hexdigest(),
        "integrity": integrity,
    }
    return source.replace("const RELEASE = null;", "const RELEASE = " + json.dumps(release) + ";", 1)


if __name__ == "__main__":
    try:
        sys.stdout.write(prepare())
    except (OSError, ValueError, AttributeError) as error:
        print(f"Could not prepare the PWA release: {error}", file=sys.stderr)
        sys.exit(1)
