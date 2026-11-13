#!/usr/bin/env bash
set -euo pipefail

cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

host=steffenbew.com
target=/www/htdocs/w00c06d8/subdomains/orbitrush
url=https://orbitrush.steffenbew.com

# Explicit allowlist: never publish repository metadata, tests or local secrets.
ssh -o BatchMode=yes "$host" "mkdir -p '$target'"
rsync -rtvz --chmod=D755,F644 -e 'ssh -o BatchMode=yes' \
  .htaccess index.html audio.js i18n.js render-diagnostics.js CREDITS.md assets "$host:$target/"

curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --retry 3 --retry-delay 5 --output /dev/null "$url/"
printf '\nDeployed: %s\n' "$url/"
