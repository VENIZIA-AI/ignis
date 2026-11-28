// `bun run client:grpc-js` - the four call kinds with @grpc/grpc-js on the native port. Add --tls when the server
// runs with TLS.
import { ClientSettings } from '@clients/client-settings';
import { NotesGrpcJsClient } from '@clients/grpc-js.client';

const port = ClientSettings.readPort({ key: 'APP_ENV_GRPC_PORT', fallback: '50051' });
const client = new NotesGrpcJsClient({
  address: `127.0.0.1:${port}`,
  ca: ClientSettings.hasFlag({ name: 'tls' }) ? ClientSettings.readCertificate() : undefined,
});
const log = (line: string) => process.stdout.write(`${line}\n`);

await client.signIn({ username: 'alice', password: ClientSettings.readPassword() });
log('signed in as alice');

const { ids } = await client.importNotes({ notes: [{ title: 'from grpc-js' }] });
log(`client stream: imported ${ids.length} note`);

const { note } = await client.getNote({ id: ids[0] });
log(`unary: read "${note?.title}"`);

const listed = await client.watchNotes({ follow: false });
log(`server stream: ${listed.length} notes`);

const synced = await client.syncNotes({
  notes: [
    { clientRef: 'a', title: 'synced' },
    { clientRef: 'b', title: '' },
  ],
});
log(
  `bidi stream: ${synced.map((answer) => `${answer.clientRef}=${answer.result.case}`).join(' ')}`,
);

client.close();
process.exit(0);
