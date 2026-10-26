/**
 * Usage: bun scripts/checks/tmp-leak/cli.ts snapshot|verify
 * `snapshot` records both temp folders before a test run; `verify` fails (exit 1) when the run
 * left anything new in either. Only names the current user created after the snapshot count.
 * IGNIS_TMP_LEAK_IGNORE (a regular expression on the entry name) skips a name another program on a
 * shared machine writes meanwhile. The sanctioned system-temp paths are TmpLeak.ALLOWED_SYSTEM_PATHS.
 */
import { TmpLeak } from './tmp-leak';

const command = process.argv[2];
const repoTmp = TmpLeak.repoTmp();
const systemTmp = TmpLeak.systemTmp();

if (command === 'snapshot') {
  TmpLeak.snapshot({ repoTmp, systemTmp });
  console.log(`[tmp-leak] snapshot of ${systemTmp} and ${repoTmp}`);
} else if (command === 'verify') {
  const pattern = process.env.IGNIS_TMP_LEAK_IGNORE;
  const { leaks, allowed } = TmpLeak.verify({
    repoTmp,
    systemTmp,
    ignore: pattern ? new RegExp(pattern) : undefined,
  });
  for (const path of allowed) {
    console.log(`[tmp-leak] allowed, left by a sanctioned gate: ${path}`);
  }
  if (leaks.length > 0) {
    console.error(
      `[tmp-leak] the test run left ${leaks.length} entr${leaks.length === 1 ? 'y' : 'ies'}:`,
    );
    for (const leak of leaks) {
      console.error(`  ${leak}`);
    }
    process.exit(1);
  }
  console.log('[tmp-leak] the test run left nothing in either temp folder');
} else {
  console.error('usage: bun scripts/checks/tmp-leak/cli.ts snapshot|verify');
  process.exit(2);
}
