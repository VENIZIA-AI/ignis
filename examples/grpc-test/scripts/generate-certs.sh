#!/usr/bin/env sh
# A self-signed certificate for the native gRPC port on this machine. Development only: certs/ is gitignored,
# and a real service takes its certificate from its platform.
#   sh scripts/generate-certs.sh [folder]     the folder is certs/ unless you name one
set -eu
cd "$(dirname "$0")/.."

folder="${1:-certs}"
mkdir -p "$folder"
# The private key is readable by you alone.
umask 077

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 \
  -keyout "$folder/server.key" -out "$folder/server.crt" \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'

echo "Wrote $folder/server.crt and $folder/server.key (30 days, localhost and 127.0.0.1)"
