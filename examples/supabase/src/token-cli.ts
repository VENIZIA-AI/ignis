import { writeSync } from 'node:fs';
import { mintToken } from '@/token';

const subject = process.argv[2];

// The token is this command's result: it goes to stdout alone, written in full before the process ends.
if (!subject) {
  writeSync(2, 'Usage: bun run token -- <user-uuid> [role]\n');
  process.exit(1);
}

mintToken({ subject, role: process.argv[3] })
  .then((token) => writeSync(1, `${token}\n`))
  .catch((error: unknown) => {
    writeSync(2, `[token] Failed to mint token | Error: ${String(error)}\n`);
    process.exit(1);
  });
