import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildManifest } from './manifest';
import type { IPurityClaim, IPurityEntry, IPurityOptions } from './manifest';
import { probeEntry } from './probe';
import type { IPurityResult } from './probe';

/** The outcome of one row, as the text report and the JSON verdict both name it. */
export class PurityVerdicts {
  static readonly PASS = 'pass';
  static readonly FAIL = 'fail';
  static readonly WAIVED = 'waived';
  static readonly MISSING = 'missing';
  static readonly STALE_WAIVER = 'stale-waiver';

  static readonly SCHEME_SET = new Set<string>([
    this.PASS,
    this.FAIL,
    this.WAIVED,
    this.MISSING,
    this.STALE_WAIVER,
  ]);

  static isValid(value: string): value is TPurityVerdict {
    return this.SCHEME_SET.has(value);
  }
}

export type TPurityVerdict = Extract<(typeof PurityVerdicts)[keyof typeof PurityVerdicts], string>;

/** One row of the `--json` verdict: nothing machine- or time-specific, so two runs on one commit diff empty. */
export interface IPurityRowVerdict {
  label: string;
  entry: string;
  verdict: TPurityVerdict;
  sizeBytes?: number;
  builtins?: string[];
  globals?: string[];
  guardedGlobals?: string[];
  external?: string[];
  buildError?: string;
}

export interface IPurityReport {
  rows: IPurityRowVerdict[];
  failed: number;
  waived: number;
  checked: number;
}

const formatList = (values: string[]): string => values.join(', ') || 'none';

/**
 * Probes every row of the claims and returns the report. `print` receives the human report line by
 * line, in the exact shape the repository scripts printed before the engine moved here.
 */
export const checkPurity = async (opts: {
  root: string;
  claims: IPurityClaim[];
  options?: IPurityOptions;
  /** Only the rows of this package; a token that matches nothing is a broken gate and returns `undefined`. */
  filter?: string;
  /** The claims file, repository-relative, named in the hint printed for a stale waiver. */
  claimsFile: string;
  print: (line: string) => void;
  /** Where the no-match message goes (stderr for the command): it is an error, not a report line. */
  printError: (line: string) => void;
}): Promise<IPurityReport | undefined> => {
  const { root, claims, options, filter, claimsFile, print, printError } = opts;
  const manifest = buildManifest({ claims, root, options });
  const rows: IPurityEntry[] = filter ? manifest.filter((row) => row.package === filter) : manifest;

  // Non-zero, not a friendly note: a mistyped `package` or a renamed directory would otherwise turn
  // a release-blocking gate into a silent no-op that still reports success.
  if (rows.length === 0) {
    const known = [...new Set(manifest.map((row) => row.package))].sort().join(', ');
    printError(
      `[purity] No manifest entry matches "${filter}" | Known packages: ${known} - a filter that ` +
        `matches nothing is a broken gate, not an empty one.`,
    );
    return undefined;
  }

  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const verdicts: IPurityRowVerdict[] = [];
  let failed = 0;
  let waived = 0;

  for (const row of rows) {
    const entry = join(root, row.entry);

    // The `exports` map is the source of these rows, so a missing file is either an unbuilt package
    // or a manifest pointing at something the build never emits - both fatal, and neither is worth
    // reporting as a bundler error twenty lines long.
    if (!existsSync(entry)) {
      failed += 1;
      print(`  ✗ ${row.label.padEnd(labelWidth)} MISSING ${row.entry}`);
      print(
        `    The package's \`exports\` map points here and nothing is built - run \`make ${row.package}\``,
      );
      verdicts.push({ label: row.label, entry: row.entry, verdict: PurityVerdicts.MISSING });
      continue;
    }

    const result: IPurityResult = await probeEntry({
      entry,
      cwd: root,
      external: row.external,
    });

    const detail = {
      label: row.label,
      entry: row.entry,
      sizeBytes: result.sizeBytes,
      builtins: result.builtins,
      globals: result.globals,
      guardedGlobals: result.guardedGlobals,
      external: result.external,
      // The bundler's message names absolute paths; the verdict must read the same on any machine.
      ...(result.buildError ? { buildError: result.buildError.replaceAll(root, '<root>') } : {}),
    };

    // Guarded reads are printed on the passing path too: they are safe, but a reviewer needs to
    // see that the entry is clean by construction and not merely by the shape of one expression.
    const guarded =
      result.guardedGlobals.length > 0 ? ` | guarded: ${result.guardedGlobals.join(', ')}` : '';

    // Same reasoning as `guarded`, printed on both paths: an entry that externalises a dependency
    // measures less than one that does not, and that must stay visible next to the verdict.
    const external = result.external.length > 0 ? ` | external: ${result.external.join(', ')}` : '';

    // Checked before the normal verdict, because for a waived row the two outcomes swap meaning.
    if (row.expectImpure) {
      // A waived entry that comes back pure fails: the waiver now describes something untrue, and
      // the reader who trusts it next will be trusting it about a different entry.
      if (result.ok) {
        failed += 1;
        print(`  ✗ ${row.label.padEnd(labelWidth)} STALE WAIVER - this entry is browser-pure now`);
        print(`    Drop it from \`impure\` in ${claimsFile} so the gate measures it again`);
        verdicts.push({ ...detail, verdict: PurityVerdicts.STALE_WAIVER });
        continue;
      }

      waived += 1;
      print(
        `  ~ ${row.label.padEnd(labelWidth)} waived | builtins: ${formatList(result.builtins)} | globals: ${formatList(result.globals)}${external}`,
      );
      verdicts.push({ ...detail, verdict: PurityVerdicts.WAIVED });
      continue;
    }

    if (result.ok) {
      print(
        `  ✓ ${row.label.padEnd(labelWidth)} ${(result.sizeBytes / 1024).toFixed(1)} KB${guarded}${external}`,
      );
      verdicts.push({ ...detail, verdict: PurityVerdicts.PASS });
      continue;
    }

    failed += 1;
    print(
      `  ✗ ${row.label.padEnd(labelWidth)} builtins: ${formatList(result.builtins)} | globals: ${formatList(result.globals)}${guarded}${external}`,
    );
    if (result.buildError) {
      print(`    ${result.buildError.split('\n')[0]}`);
    }
    verdicts.push({ ...detail, verdict: PurityVerdicts.FAIL });
  }

  const note = waived > 0 ? ` (${waived} waived as known-impure)` : '';

  if (failed > 0) {
    print(`\n[purity] ${failed}/${rows.length} entries are not browser-pure${note}.`);
  } else {
    const checked = rows.length - waived;
    print(`\n[purity] ${checked}/${checked} entries are browser-pure${note}.`);
  }

  return { rows: verdicts, failed, waived, checked: rows.length - waived };
};
