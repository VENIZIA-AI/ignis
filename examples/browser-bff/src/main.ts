import { BFF_BASE_PATH, bff } from './bff';

interface INote {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
}

const rowsElement = document.getElementById('rows') as HTMLPreElement;
const statusElement = document.getElementById('status') as HTMLParagraphElement;
const addButton = document.getElementById('add-note') as HTMLButtonElement;
const readButton = document.getElementById('read-notes') as HTMLButtonElement;

const setStatus = (text: string): void => {
  statusElement.textContent = text;
};

/** The list route answers with `{ count, data }`; a bare array is accepted too so a shape change is visible rather than fatal. */
const readNotes = (payload: unknown): INote[] => {
  if (Array.isArray(payload)) {
    return payload as INote[];
  }

  const data = (payload as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as INote[]) : [];
};

const render = (notes: INote[]): void => {
  rowsElement.textContent = JSON.stringify(notes, null, 2);
  console.log('[main] rendered %d note(s)', notes.length, notes);
};

const listNotes = async (): Promise<void> => {
  setStatus('Reading...');

  const response = await bff.fetch({ request: new Request(BFF_BASE_PATH) });
  const payload: unknown = await response.json();

  console.log('[main] GET %s -> %d', BFF_BASE_PATH, response.status, payload);

  const notes = readNotes(payload);
  render(notes);
  setStatus(`${notes.length} note(s) in OPFS`);
};

const addNote = async (): Promise<void> => {
  setStatus('Writing...');

  const title = `note-${new Date().toISOString()}`;
  const response = await bff.fetch({
    request: new Request(BFF_BASE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body: 'written from the page, stored by PGlite in OPFS' }),
    }),
  });

  const payload: unknown = await response.json();
  console.log('[main] POST %s -> %d', BFF_BASE_PATH, response.status, payload);

  await listNotes();
};

/**
 * Never a silent failure: a rejected BFF call must show up in the page and in the console, because
 * a Worker that never answers looks exactly like a Worker that answered with nothing.
 */
const run = (task: () => Promise<void>): void => {
  task().catch((error: unknown) => {
    console.error('[main] BFF call failed | error:', error);
    setStatus(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  });
};

addButton.addEventListener('click', () => run(addNote));
readButton.addEventListener('click', () => run(listNotes));

console.log('[main] booting the BFF worker...');

run(async () => {
  await listNotes();
});
