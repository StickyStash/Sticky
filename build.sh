#!/bin/sh
# ─────────────────────────────────────────────────────────────────────
# Sticky — build the plugin source
#
# Produces _site/, which is everything a Stash "plugin source" needs:
#
#   _site/index.yml    the list Stash reads (one entry: Sticky)
#   _site/sticky.zip   the plugin itself
#
# Host _site/ anywhere that serves static files (the GitHub Actions
# workflow in .github/workflows/pages.yml publishes it to GitHub
# Pages), then in Stash: Settings → Plugins → Available Plugins →
# Add Source, and paste the address of index.yml.
#
# Stash names an installed plugin after its .yml file, so the
# manifest goes into the zip as sticky.yml and the theme installs as
# "sticky", the same id it has when copied in by hand. The theme works
# out its own id when it loads, so a renamed copy works too.
#
# Usage: sh build.sh          (from this folder; needs zip and git)
# ─────────────────────────────────────────────────────────────────────
set -eu

ID=sticky
OUT=${OUT:-_site}
SRC_YML=sticky.yml

cd "$(dirname "$0")"

field() { sed -n "s/^$1: *//p" "$SRC_YML" | head -n 1; }
NAME=$(field name)
VERSION=$(field version)
DESCRIPTION=$(field description)
DATE=$(date -u +"%Y-%m-%d %H:%M:%S")

[ -n "$NAME" ] && [ -n "$VERSION" ] || { echo "build.sh: couldn't read name/version from $SRC_YML" >&2; exit 1; }

rm -rf "$OUT"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT" "$STAGE/css" "$STAGE/js"
cp "$SRC_YML" "$STAGE/$ID.yml"
cp js/*.js "$STAGE/js/"
cp css/*.css "$STAGE/css/"
cp -R assets "$STAGE/"
[ -f LICENSE ] && cp LICENSE "$STAGE/"

# Files the manifest lists that aren't here are left out of the
# published manifest, so an optional part can be removed just by
# deleting its files. (Stash itself only logs and skips a
# listed file that's missing, but there's no reason to make it.)
for f in $(sed -n 's/^ *- *\(.*\.\(js\|css\)\)$/\1/p' "$SRC_YML"); do
    if [ ! -f "$STAGE/$f" ]; then
        echo "build.sh: $f isn't here — leaving it out of $ID.yml"
        grep -v "^ *- *$f\$" "$STAGE/$ID.yml" > "$STAGE/$ID.yml.tmp"
        mv "$STAGE/$ID.yml.tmp" "$STAGE/$ID.yml"
    fi
done

ZIP="$(cd "$OUT" && pwd)/$ID.zip"
( cd "$STAGE" && zip -qrX "$ZIP" . )

if command -v sha256sum >/dev/null 2>&1; then
    SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
else
    SHA=$(shasum -a 256 "$ZIP" | cut -d' ' -f1)
fi

# YAML-safe description: wrap in double quotes, escape any inside it.
DESC_Q=$(printf '%s' "$DESCRIPTION" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > "$OUT/index.yml" <<EOF
- id: $ID
  name: $NAME
  metadata:
    description: "$DESC_Q"
  version: $VERSION
  date: "$DATE"
  path: $ID.zip
  sha256: $SHA
EOF

echo "Built $NAME $VERSION → $OUT/index.yml, $OUT/$ID.zip ($SHA)"
