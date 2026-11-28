#!/usr/bin/env sh
# A self-signed certificate for the native gRPC port on this machine. Development only: certs/ is gitignored,
# and a real service takes its certificate from its platform.
set -eu
cd "$(dirname "$0")/.."

mkdir -p certs
# The private key is readable by you alone.
umask 077

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 \
  -keyout certs/server.key -out certs/server.crt \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'

echo "Wrote certs/server.crt and certs/server.key (30 days, localhost and 127.0.0.1)"
