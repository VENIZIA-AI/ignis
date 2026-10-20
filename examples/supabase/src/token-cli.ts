import { mintToken } from '@/token';

const subject = process.argv[2];

if (!subject) {
  console.error('Usage: bun run token -- <user-uuid> [role]');
  process.exit(1);
}

mintToken({ subject, role: process.argv[3] })
  .then(token => console.log(token))
  .catch((error: unknown) => {
    console.error('[token] Failed to mint token | Error:', error);
    process.exit(1);
  });
