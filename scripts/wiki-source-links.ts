/**
 * Checks that every source path the wiki and the knowledge bundle name is tracked by git. Walks
 * every `.md` file under the given directories and extracts three kinds of reference: an IGNIS
 * `blob/main/<path>` or `tree/main/<path>` GitHub link target - scoped to the `VENIZIA-AI/ignis`
 * repo, so a link into another project's repo is never checked - (checked in every file), a
 * backticked path starting with `packages/`, `examples/`, `scripts/`, `docs/` or `.agents/` and
 * ending in a source or doc extension (checked outside `skipProseUnder`, where a changelog is
 * allowed to name history), and a knowledge concept's YAML frontmatter `resource:` value with one
 * of the same five prefixes (checked only under `.agents/knowledge`). A path exists when `git
 * ls-files` tracks it, as a file or as a directory prefix - a gitignored build artifact or local
 * planning doc is never a valid target, since GitHub, and a tracked-only checkout, never has it
 * either. Run from the repo root: bun scripts/wiki-source-links.ts (both the file walk and `git
 * ls-files` resolve against the current working directory).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Auto-generated or free-form history content; never held to the "path exists" gate.
const ALWAYS_SKIP = ['.agents/knowledge/log.md', '.agents/knowledge/reference'];
const BACKTICK_PREFIXES = ['packages/', 'examples/', 'scripts/', 'docs/', '\\.agents/'];
const BACKTICK_EXTENSIONS = ['ts', 'tsx', 'md', 'json', 'mjs', 'js', 'yaml', 'yml'];
// Same five roots as BACKTICK_PREFIXES, unescaped for a plain `.startsWith()` check against a
// frontmatter value - `resource:` never carries a line number or a regex-special character.
const RESOURCE_PREFIXES = ['packages/', 'examples/', 'scripts/', 'docs/', '.agents/'];
// `resource:` is an OKF concept field; it never appears in the wiki's own frontmatter.
const KNOWLEDGE_DIR = '.agents/knowledge';
const RESOURCE_LINE_PATTERN = /^resource:\s*(.+)$/;
// `<>` is placeholder notation (docs describing the pattern itself), never a real GitHub path.
// Anchored to this repo, so a link into someone else's GitHub project is never a checked target.
const GITHUB_LINK_PATTERN = /VENIZIA-AI\/ignis\/(?:blob|tree)\/main\/([^\s)\]"'`<>]+)/g;
// `{}` and `*` mark a template placeholder or a glob (a naming pattern, not one file); `<>` is the
// same placeholder notation as above. The optional `:<line>`/`#L<n>` suffix stays inside the
// capture so `stripLineSuffix` below has something to strip on this branch too.
const BACKTICK_PATTERN = new RegExp(
  `\`((?:${BACKTICK_PREFIXES.join('|')})[^\`{}*<>]+?\\.(?:${BACKTICK_EXTENSIONS.join('|')})` +
    '(?::\\d+|#L\\d+)?)`',
  'g',
);
const LINE_SUFFIX_PATTERN = /(:\d+|#L\d+)$/;

interface IMiss {
  file: string;
  line: number;
  path: string;
}

interface ITrackedPaths {
  files: Set<string>;
  dirs: Set<string>;
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
    const tracked = SourceLinkCheck.loadTracked(repoRoot);
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
      if (SourceLinkCheck.isUnder(relPath, KNOWLEDGE_DIR)) {
        const resource = SourceLinkCheck.extractResourceLine(lines);
        if (resource) {
          checked += 1;
          if (!SourceLinkCheck.exists(tracked, resource.path)) {
            missing.push({ file: relPath, line: resource.line, path: resource.path });
          }
        }
      }
      lines.forEach((text, index) => {
        for (const path of SourceLinkCheck.extractPaths(text, skipProse)) {
          checked += 1;
          if (!SourceLinkCheck.exists(tracked, path)) {
            missing.push({ file: relPath, line: index + 1, path });
          }
        }
      });
    }
    missing.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
    return { checked, missing };
  }

  // `git ls-files` is the source of truth, not `existsSync` - a gitignored file (a build artifact,
  // a local planning doc) must never pass, because GitHub and a tracked-only checkout don't have
  // it. `dirs` covers `tree/main/<path>` links: a directory "exists" when some tracked file sits
  // under it.
  private static loadTracked(repoRoot: string): ITrackedPaths {
    const output = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' });
    const files = new Set(output.split('\0').filter(Boolean));
    const dirs = new Set<string>();
    for (const file of files) {
      const segments = file.split('/');
      for (let depth = 1; depth < segments.length; depth += 1) {
        dirs.add(segments.slice(0, depth).join('/'));
      }
    }
    return { files, dirs };
  }

  private static exists(tracked: ITrackedPaths, path: string): boolean {
    return tracked.files.has(path) || tracked.dirs.has(path);
  }

  private static extractPaths(text: string, skipProse: boolean): string[] {
    const found = [...text.matchAll(GITHUB_LINK_PATTERN)].map(match =>
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

  // Reads the `resource:` line from a concept's YAML frontmatter (the fence at line 1, the value
  // between it and the next fence). Returns null when there is no frontmatter, no `resource:`
  // line, or the value has none of the five tracked prefixes.
  private static extractResourceLine(lines: string[]): { line: number; path: string } | null {
    if (lines[0] !== '---') {
      return null;
    }
    const closeIndex = lines.indexOf('---', 1);
    if (closeIndex === -1) {
      return null;
    }
    for (let index = 1; index < closeIndex; index += 1) {
      const match = lines[index].match(RESOURCE_LINE_PATTERN);
      // A directory value may carry a trailing slash; `git ls-files` never does.
      const value = match?.[1].trim().replace(/\/+$/, '');
      if (value && RESOURCE_PREFIXES.some(prefix => value.startsWith(prefix))) {
        return { line: index + 1, path: value };
      }
    }
    return null;
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
