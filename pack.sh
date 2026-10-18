#!/usr/bin/env bash
set -e

UUID="quickshare@niksanand1717.github.com"
OUTPUT="${UUID}.shell-extension.zip"

echo "Packing GNOME Shell Extension: ${UUID}..."
rm -f "${OUTPUT}"
zip -FS -r "${OUTPUT}" metadata.json extension.js stylesheet.css

echo "Successfully built: ${OUTPUT}"
echo "You can upload this file directly to: https://extensions.gnome.org/upload/"
