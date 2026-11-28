#!/usr/bin/env sh
# The four call kinds on the native gRPC port with grpcurl (https://github.com/fullstorydev/grpcurl).
#   sh scripts/grpcurl.sh          clear text (h2c)
#   sh scripts/grpcurl.sh --tls    TLS, trusting certs/server.crt
# GRPCURL names the binary when it is not on PATH. The server has no reflection: grpcurl reads the .proto.
set -eu
cd "$(dirname "$0")/.."

# The same file the server reads, for the demo password and the port.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
: "${APP_ENV_DEMO_PASSWORD:?set it in .env}"

GRPCURL="${GRPCURL:-grpcurl}"
ADDRESS="127.0.0.1:${APP_ENV_GRPC_PORT:-50051}"
SECURITY='-plaintext'

if [ "${1:-}" = '--tls' ]; then
  SECURITY='-cacert certs/server.crt'
fi

call() {
  # SECURITY is two words with TLS, so it stays unquoted.
  # shellcheck disable=SC2086
  "$GRPCURL" $SECURITY -import-path proto -proto notes/v1/notes.proto "$@"
}

# The code of a call that has to fail.
refused() {
  if output=$(call "$@" 2>&1); then
    echo "expected a refusal, got: $output" >&2
    exit 1
  fi
  printf '%s\n' "$output" | grep -E 'Code:|Message:'
}

token_of() {
  call -d "{\"username\":\"$1\",\"password\":\"$APP_ENV_DEMO_PASSWORD\"}" \
    "$ADDRESS" notes.v1.NotesService/SignIn | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p'
}

echo '== public unary: SignIn'
ALICE=$(token_of alice)
BOB=$(token_of bob)
[ -n "$ALICE" ] && [ -n "$BOB" ]
echo 'got a token for alice (editor) and bob (viewer)'

echo '== refused: no token'
refused "$ADDRESS" notes.v1.NotesService/WatchNotes

echo '== refused: a viewer imports'
refused -H "authorization: Bearer $BOB" -d '{"title":"no"}' "$ADDRESS" notes.v1.NotesService/ImportNotes

echo '== client stream: ImportNotes (-d @ reads one JSON message after another)'
call -H "authorization: Bearer $ALICE" -d @ "$ADDRESS" notes.v1.NotesService/ImportNotes <<'JSON'
{"title":"from grpcurl","body":"one"}
{"title":"second from grpcurl"}
JSON

echo '== server stream: WatchNotes, with response headers and trailers'
call -v -max-time 5 -H "authorization: Bearer $ALICE" "$ADDRESS" notes.v1.NotesService/WatchNotes

echo '== unary: GetNote, with request metadata'
ID=$(call -H "authorization: Bearer $ALICE" "$ADDRESS" notes.v1.NotesService/WatchNotes |
  sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -n 1)
call -max-time 5 -H "authorization: Bearer $ALICE" -H 'x-client-name: grpcurl' -d "{\"id\":\"$ID\"}" \
  "$ADDRESS" notes.v1.NotesService/GetNote

echo '== bidirectional stream: SyncNotes'
call -H "authorization: Bearer $ALICE" -d @ "$ADDRESS" notes.v1.NotesService/SyncNotes <<'JSON'
{"clientRef":"a","title":"synced"}
{"clientRef":"b","title":""}
JSON

echo '== deadline: a followed stream ends after 1 second'
refused -max-time 1 -H "authorization: Bearer $ALICE" -d '{"follow":true}' \
  "$ADDRESS" notes.v1.NotesService/WatchNotes

echo 'grpcurl done'
