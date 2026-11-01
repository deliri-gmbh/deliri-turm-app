#!/bin/sh
# Versionsnummer erhöhen, damit Handys die neue Version sofort laden
V=$(date +%Y%m%d%H%M)
sed -i -E "s/\?v=[0-9]+/?v=$V/g; s/window.APP_VERSION='[0-9]+'/window.APP_VERSION='$V'/" index.html
printf '{"v":"%s"}\n' "$V" > version.json
