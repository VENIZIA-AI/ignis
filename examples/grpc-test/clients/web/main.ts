// The page `bun run web:build` bundles; the application serves it at /demo.
import { NotesWebClient } from '@clients/web/notes-web.client';
import { ConnectError } from '@connectrpc/connect';

// Same origin as the page: no CORS.
const client = new NotesWebClient({ baseUrl: `${location.origin}/api/grpc` });
let following: AbortController | undefined;

const output = document.querySelector('#output');
const log = (line: string) => output?.append(`${line}\n`);

const valueOf = (selector: string) => {
  const element = document.querySelector(selector);

  return element instanceof HTMLInputElement ? element.value : '';
};

const onClick = (selector: string, action: () => Promise<void>) => {
  document.querySelector(selector)?.addEventListener('click', () => {
    action().catch((error: unknown) => log(ConnectError.from(error).message));
  });
};

onClick('#sign-in', async () => {
  const username = valueOf('#username');
  await client.signIn({ username, password: valueOf('#password') });
  log(`signed in as ${username}`);
});

// Server stream: stays open, and shows a note the moment it is created.
onClick('#watch', async () => {
  following?.abort();
  following = new AbortController();

  for await (const note of client.watchNotes({ follow: true, signal: following.signal })) {
    log(`note ${note.id}: ${note.title}`);
  }
});

onClick('#stop', async () => following?.abort());

// Unary.
onClick('#get', async () => {
  const note = await client.getNote({ id: valueOf('#id') });
  log(`read: ${note.title} - ${note.body}`);
});
