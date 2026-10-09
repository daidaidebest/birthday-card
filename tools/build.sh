#!/bin/sh
# Rebuild js/gift.js from the modules in js/ (only needed after editing the .js sources; content.js needs no build).
cd "$(dirname "$0")/../site" && npx --yes esbuild@0.25.0 js/main.js --bundle --format=iife --minify --target=es2020,safari15 --outfile=js/gift.js --legal-comments=none
