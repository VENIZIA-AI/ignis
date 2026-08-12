import { join } from 'node:path';
import { PURITY_MANIFEST } from './manifest';
import { probeEntry } from './probe';

const REPOSITORY_ROOT = join(__dirname, '../..');

const run = async (): Promise<void> => {
  const filter = process.argv[2];
  const rows = filter ? PURITY_MANIFEST.filter(r => r.package === filter) : PURITY_MANIFEST;

  if (rows.length === 0) {
    console.log(`[purity] No manifest entry for "${filter ?? '(all)'}" - nothing to check.`);
    return;
  }

  let failed = 0;

  for (const row of rows) {
    const result = await probeEntry({
      entry: join(REPOSITORY_ROOT, row.entry),
      cwd: REPOSITORY_ROOT,
    });

    if (result.ok) {
      console.log(`  ✓ ${row.label.padEnd(18)} ${(result.sizeBytes / 1024).toFixed(1)} KB`);
      continue;
    }

    failed += 1;
    console.log(`  ✗ ${row.label.padEnd(18)} builtins: ${result.builtins.join(', ') || 'none'} | globals: ${result.globals.join(', ') || 'none'}`);
    if (result.buildError) {
      console.log(`    ${result.buildError.split('\n')[0]}`);
    }
  }

  if (failed > 0) {
    console.log(`\n[purity] ${failed}/${rows.length} entries are not browser-pure.`);
    process.exit(1);
  }

  console.log(`\n[purity] ${rows.length}/${rows.length} entries are browser-pure.`);
};

await run();
