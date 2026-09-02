/**
 * Checks that every source path the wiki and the knowledge bundle name still exists on disk.
 * Walks every `.md` file under the given directories and extracts two kinds of reference: a
 * `blob/main/<path>` link target (checked in every file) and a backticked path starting with
 * `packages/`, `examples/`, `scripts/`, `docs/` or `.agents/` and ending in a source or doc
 * extension (checked outside `skipProseUnder`, where a changelog is allowed to name history).
 * Run from the repo root: bun scripts/wiki-source-links.ts (paths resolve against the current
 * working directory).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Auto-generated or free-form history content; never held to the "path exists" gate.
const ALWAYS_SKIP = ['.agents/knowledge/log.md', '.agents/knowledge/reference'];
const BACKTICK_PREFIXES = ['packages/', 'examples/', 'scripts/', 'docs/', '\\.agents/'];
const BACKTICK_EXTENSIONS = ['ts', 'tsx', 'md', 'json', 'mjs', 'js', 'yaml', 'yml'];
// `{}`, `*` and `<>` mark a naming pattern (a template placeholder or a glob), not one named file.
const BLOB_MAIN_PATTERN = /blob\/main\/([^\s)\]"'`<>]+)/g;
const BACKTICK_PATTERN = new RegExp(
  `\`((?:${BACKTICK_PREFIXES.join('|')})[^\`{}*<>]+?\\.(?:${BACKTICK_EXTENSIONS.join('|')}))\``,
  'g',
);
const LINE_SUFFIX_PATTERN = /(:\d+|#L\d+)$/;

interface IMiss {
  file: string;
  line: number;
  path: string;
}

export class SourceLinkCheck {
  private constructor(
    private readonly dirs: string[],
    private readonly skipProseUnder: string[],
  ) {}

  static fromDirectories(opts: { dirs: string[]; skipProseUnder: string[] }): SourceLinkCheck {
    return new SourceLinkCheck(opts.dirs, opts.skipProseUnder);
  }

  run(): { checked: number; missing: IMiss[] } {
    const repoRoot = process.cwd();
    const files = this.dirs.flatMap(dir => SourceLinkCheck.walk(resolve(repoRoot, dir)));
    let checked = 0;
    const missing: IMiss[] = [];
    for (const file of files) {
      const relPath = relative(repoRoot, file);
      if (SourceLinkCheck.isAlwaysSkipped(relPath)) {
        continue;
      }
      const skipProse = this.skipProseUnder.some(dir => SourceLinkCheck.isUnder(relPath, dir));
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, index) => {
        for (const path of SourceLinkCheck.extractPaths(text, skipProse)) {
          checked += 1;
          if (!existsSync(join(repoRoot, path))) {
            missing.push({ file: relPath, line: index + 1, path });
          }
        }
      });
    }
    missing.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
    return { checked, missing };
  }

  private static extractPaths(text: string, skipProse: boolean): string[] {
    const found = [...text.matchAll(BLOB_MAIN_PATTERN)].map(match =>
      SourceLinkCheck.stripLineSuffix(match[1]),
    );
    if (skipProse) {
      return found;
    }
    const prose = [...text.matchAll(BACKTICK_PATTERN)].map(match =>
      SourceLinkCheck.stripLineSuffix(match[1]),
    );
    return [...found, ...prose];
  }

  private static stripLineSuffix(path: string): string {
    return path.replace(LINE_SUFFIX_PATTERN, '');
  }

  private static isAlwaysSkipped(relPath: string): boolean {
    return ALWAYS_SKIP.some(skip => SourceLinkCheck.isUnder(relPath, skip));
  }

  private static isUnder(relPath: string, dir: string): boolean {
    return relPath === dir || relPath.startsWith(`${dir}/`);
  }

  private static walk(dir: string): string[] {
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return SourceLinkCheck.walk(full);
      }
      return entry.isFile() && entry.name.endsWith('.md') ? [full] : [];
    });
  }
}

const run = (): number => {
  const check = SourceLinkCheck.fromDirectories({
    dirs: ['docs/wiki/content', '.agents/knowledge'],
    skipProseUnder: ['docs/wiki/content/changelogs'],
  });
  const { checked, missing } = check.run();
  for (const miss of missing) {
    console.log(`${miss.file}:${miss.line} ${miss.path}`);
  }
  console.log(`wiki-source-links: ${checked} paths checked, ${missing.length} missing`);
  return missing.length > 0 ? 1 : 0;
};

if (import.meta.main) {
  process.exit(run());
}
