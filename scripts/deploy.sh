#!/usr/bin/env bash
set -euo pipefail
cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

host=steffenbew.com
target=/www/htdocs/w00c06d8/subdomains/orbitrush
url=https://orbitrush.steffenbew.com

node scripts/build.mjs
cd dist
ssh -o BatchMode=yes "$host" "mkdir -p '$target'"
upload() {
  rsync -rtvz --checksum --chmod=D755,F644 -e 'ssh -o BatchMode=yes' "$@" "$host:$target/"
}
# Never --delete: open pages can still need files from a previous release.
upload assets .htaccess
upload app-icons licenses manifest.webmanifest CREDITS.md
upload index.html
node ../scripts/verify-release.mjs "$url/"
upload sw.js

curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --retry 3 --retry-delay 5 --output /dev/null "$url/"
printf '\nDeployed: %s\n' "$url/"
