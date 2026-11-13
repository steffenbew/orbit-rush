#!/usr/bin/env bash
set -euo pipefail

cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

host=steffenbew.com
target=/www/htdocs/w00c06d8/subdomains/orbitrush
url=https://orbitrush.steffenbew.com

# Pin the worker to this release before uploading anything. No package install/build.
temporary=$(mktemp -d "${TMPDIR:-/tmp}/orbit-rush-release.XXXXXX")
trap 'rm -rf "$temporary"' EXIT
python3 scripts/prepare-pwa.py > "$temporary/sw.js"

# Explicit allowlist: never publish repository metadata, tests or local secrets.
ssh -o BatchMode=yes "$host" "mkdir -p '$target'"
rsync -rtvz --chmod=D755,F644 -e 'ssh -o BatchMode=yes' \
  .htaccess audio.js i18n.js touch-controls.js render-diagnostics.js pwa.js manifest.webmanifest CREDITS.md assets "$host:$target/"
rsync -rtvz --chmod=F644 -e 'ssh -o BatchMode=yes' index.html "$host:$target/"
# Publish the worker last. Interrupted uploads cannot advertise a partial release.
rsync -rtvz --chmod=F644 -e 'ssh -o BatchMode=yes' "$temporary/sw.js" "$host:$target/sw.js"

curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --retry 3 --retry-delay 5 --output /dev/null "$url/"
printf '\nDeployed: %s\n' "$url/"
