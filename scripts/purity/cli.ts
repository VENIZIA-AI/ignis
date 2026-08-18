import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PURITY_MANIFEST } from './manifest';
import { probeEntry } from './probe';

const REPOSITORY_ROOT = join(__dirname, '../..');

const run = async (): Promise<void> => {
  const filter = process.argv[2];
  const rows = filter ? PURITY_MANIFEST.filter(r => r.package === filter) : PURITY_MANIFEST;

  // Non-zero, not a friendly note: a mistyped `package` or a renamed directory would otherwise turn
  // a release-blocking gate into a silent no-op that still reports success. `make purity-<pkg>` runs
  // inside the release workflow, and "nothing to check" there must never read as "checked, clean".
  if (rows.length === 0) {
    const known = [...new Set(PURITY_MANIFEST.map(r => r.package))].sort().join(', ');
    console.error(
      `[purity] No manifest entry matches "${filter}" | Known packages: ${known} - a filter that ` +
        `matches nothing is a broken gate, not an empty one.`,
    );
    process.exit(1);
  }

  const labelWidth = Math.max(...rows.map(r => r.label.length));
  let failed = 0;

  for (const row of rows) {
    const entry = join(REPOSITORY_ROOT, row.entry);

    // The `exports` map is the source of these rows, so a missing file is either an unbuilt package
    // or a manifest pointing at something the build never emits - both fatal, and neither is worth
    // reporting as a bundler error twenty lines long.
    if (!existsSync(entry)) {
      failed += 1;
      console.log(`  ✗ ${row.label.padEnd(labelWidth)} MISSING ${row.entry}`);
      console.log(`    The package's \`exports\` map points here and nothing is built - run \`make ${row.package}\``);
      continue;
    }

    const result = await probeEntry({
      entry,
      cwd: REPOSITORY_ROOT,
      external: row.external,
    });

    // Guarded reads are printed on the passing path too: they are safe, but a reviewer needs to
    // see that the entry is clean by construction and not merely by the shape of one expression.
    const guarded =
      result.guardedGlobals.length > 0 ? ` | guarded: ${result.guardedGlobals.join(', ')}` : '';

    // Same reasoning as `guarded`, printed on both paths: an entry that externalises a dependency
    // measures less than one that does not, and that must stay visible next to the verdict.
    const external = result.external.length > 0 ? ` | external: ${result.external.join(', ')}` : '';

    if (result.ok) {
      console.log(
        `  ✓ ${row.label.padEnd(labelWidth)} ${(result.sizeBytes / 1024).toFixed(1)} KB${guarded}${external}`,
      );
      continue;
    }

    failed += 1;
    console.log(
      `  ✗ ${row.label.padEnd(labelWidth)} builtins: ${result.builtins.join(', ') || 'none'} | globals: ${result.globals.join(', ') || 'none'}${guarded}${external}`,
    );
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
