import { mintToken } from '@/token';

const subject = process.argv[2];

// The token is this command's result: it goes to stdout alone. `Bun.write` resolves once every byte is written.
if (!subject) {
  await Bun.write(Bun.stderr, 'Usage: bun run token -- <user-uuid> [role]\n');
  process.exit(1);
}

try {
  const token = await mintToken({ subject, role: process.argv[3] });
  await Bun.write(Bun.stdout, `${token}\n`);
} catch (error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);

  await Bun.write(Bun.stderr, `[token] Failed to mint token | Error: ${detail}\n`);
  process.exit(1);
}
