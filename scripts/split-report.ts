/**
 * Informational report behind the file-splitting convention (conventions/file-splitting.md):
 * hub candidates, stray types files, scope folders without a barrel, files over the soft mark,
 * and import cycles per package. Never a gate. Usage: bun scripts/split-report.ts [packages/kernel]
 * - with no argument, scans every packages/* and examples/* directory that has a src/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { ModuleGraph } from './module-cycles';

const SKIP = new Set(['node_modules', 'dist', '__tests__', 'generated', '.turbo']);
const SOFT_LINE_MARK = 500;
const HUB_EXPORT_MARK = 10;
const DECLARATION_KEYWORDS = ['class', 'const', 'type', 'interface', 'function', 'enum', 'let'];
const DECLARATION = new RegExp(
  `^export\\s+(?:default\\s+)?(?:abstract\\s+)?(${DECLARATION_KEYWORDS.join('|')})\\s+(\\w+)`,
  'gm',
);
const EXPORTED_CLASS = /^export\s+(?:abstract\s+)?class\s+(\w+)/gm;

interface IFileFacts {
  file: string;
  lines: number;
  exports: number;
  classes: string[];
}

export class SplitReport {
  static run(opts: { packageDir: string }): void {
    const src = join(opts.packageDir, 'src');
    if (!existsSync(src)) {
      return;
    }
    const facts = SplitReport.walk({ dir: src }).map(file => SplitReport.facts({ file }));
    const rel = (file: string) => relative(opts.packageDir, file);

    const hubs = facts.filter(
      f => ['types.ts', 'constants.ts'].includes(basename(f.file)) && f.exports > HUB_EXPORT_MARK,
    );
    const multiClass = facts.filter(
      f => f.classes.length >= 2 && !SplitReport.isAbstractBasePair({ facts: f }),
    );
    const strayTypes = facts.filter(
      f => ['types.ts', 'constants.ts'].includes(basename(f.file)) && !f.file.includes('/common/'),
    );
    const long = facts.filter(f => f.lines > SOFT_LINE_MARK);
    const noBarrel = SplitReport.foldersWithoutIndex({ dir: src });
    const esm = join(opts.packageDir, 'dist/esm');
    const cycles = existsSync(esm) ? ModuleGraph.fromDirectory({ dir: esm }).cycles().length : -1;

    console.log(`\n## ${basename(opts.packageDir)} - ${facts.length} files`);
    const hubTitle = `hub candidates (> ${HUB_EXPORT_MARK} exports)`;
    const hubRows = hubs.map(f => `${rel(f.file)} (${f.exports})`);
    SplitReport.section({ title: hubTitle, rows: hubRows });
    const classTitle = 'files with 2+ exported classes';
    const classRows = multiClass.map(f => `${rel(f.file)} (${f.classes.join(', ')})`);
    SplitReport.section({ title: classTitle, rows: classRows });
    const strayTitle = 'types/constants outside common/';
    const strayRows = strayTypes.map(f => rel(f.file));
    SplitReport.section({ title: strayTitle, rows: strayRows });
    const barrelTitle = 'scope folders without index.ts';
    const barrelRows = noBarrel.map(d => relative(opts.packageDir, d));
    SplitReport.section({ title: barrelTitle, rows: barrelRows });
    const longTitle = `over ${SOFT_LINE_MARK} lines (a prompt to explain, not a defect)`;
    const longRows = long.map(f => `${rel(f.file)} (${f.lines})`);
    SplitReport.section({ title: longTitle, rows: longRows });
    const cycleMsg = cycles < 0 ? 'no dist' : cycles;
    console.log(`- import cycles in dist/esm: ${cycleMsg}`);
  }

  /** Every packages/* directory, plus every examples/* directory that has a src/ folder. */
  static defaultTargets(): string[] {
    const packages = readdirSync(resolve('packages')).map(name => resolve('packages', name));
    const examples = readdirSync(resolve('examples'))
      .map(name => resolve('examples', name))
      .filter(dir => existsSync(join(dir, 'src')));
    return [...packages, ...examples];
  }

  private static section(opts: { title: string; rows: string[] }): void {
    console.log(`- ${opts.title}: ${opts.rows.length}`);
    for (const row of opts.rows) {
      console.log(`    ${row}`);
    }
  }

  private static facts(opts: { file: string }): IFileFacts {
    const text = readFileSync(opts.file, 'utf8');
    return {
      file: opts.file,
      lines: text.split('\n').length,
      exports: [...text.matchAll(DECLARATION)].length,
      classes: [...text.matchAll(EXPORTED_CLASS)].map(match => match[1]),
    };
  }

  /** abstract.ts + base.ts pairs are the format; exactly one of each is one concept. */
  private static isAbstractBasePair(opts: { facts: IFileFacts }): boolean {
    const [first, second] = opts.facts.classes;
    return (
      opts.facts.classes.length === 2 &&
      /Abstract/.test(first) &&
      /Base/.test(second)
    );
  }

  private static walk(opts: { dir: string }): string[] {
    const out: string[] = [];
    for (const name of readdirSync(opts.dir)) {
      if (SKIP.has(name)) {
        continue;
      }
      const full = join(opts.dir, name);
      if (statSync(full).isDirectory()) {
        out.push(...SplitReport.walk({ dir: full }));
      } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  private static foldersWithoutIndex(opts: { dir: string }): string[] {
    const out: string[] = [];
    for (const name of readdirSync(opts.dir)) {
      if (SKIP.has(name)) {
        continue;
      }
      const full = join(opts.dir, name);
      if (!statSync(full).isDirectory()) {
        continue;
      }
      const hasTs = readdirSync(full).some(entry => entry.endsWith('.ts') && entry !== 'index.ts');
      if (hasTs && !existsSync(join(full, 'index.ts'))) {
        out.push(full);
      }
      out.push(...SplitReport.foldersWithoutIndex({ dir: full }));
    }
    return out;
  }
}

if (import.meta.main) {
  const targets = process.argv.slice(2);
  const packages = targets.length
    ? targets.map(target => resolve(target))
    : SplitReport.defaultTargets();
  for (const packageDir of packages) {
    SplitReport.run({ packageDir });
  }
}
