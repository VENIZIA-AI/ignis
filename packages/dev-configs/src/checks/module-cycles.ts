/**
 * Lists import cycles in a built ESM directory. bun turns every member of a
 * cycle into a lazy initializer, and a barrel `export *` over such a member
 * can leave its exports undefined. Usage: devz check module-cycles packages/helpers/dist/esm [--max 0]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Only match import/export statements at the start of a line (after optional
// whitespace), ignoring matches inside comments or string literals.
const IMPORT_PATTERN = /^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm;

export class ModuleGraph {
  private constructor(
    private readonly root: string,
    private readonly edges: Map<string, string[]>,
  ) {}

  static fromDirectory(opts: { dir: string }): ModuleGraph {
    const root = resolve(opts.dir);
    const files = ModuleGraph.walk({ dir: root });
    const edges = new Map<string, string[]>();

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const targets = new Set<string>();
      const matches = text.matchAll(IMPORT_PATTERN);
      for (const match of matches) {
        const target = ModuleGraph.resolveRelative({
          from: file,
          specifier: match[1] ?? match[2],
        });
        if (target) {
          targets.add(target);
        }
      }
      edges.set(file, [...targets]);
    }

    return new ModuleGraph(root, edges);
  }

  /** Strongly connected components with more than one member, as repo-relative paths. */
  cycles(): string[][] {
    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();
    const found: string[][] = [];

    const visit = (node: string): void => {
      indices.set(node, index);
      lowLinks.set(node, index);
      index++;
      stack.push(node);
      onStack.add(node);

      const nexts = this.edges.get(node) ?? [];
      for (const next of nexts) {
        if (!indices.has(next)) {
          visit(next);
          lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(next)!));
        } else if (onStack.has(next)) {
          lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(next)!));
        }
      }

      if (lowLinks.get(node) !== indices.get(node)) {
        return;
      }
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(relative(this.root, member));
      } while (member !== node);
      if (component.length > 1) {
        found.push(component.sort());
      }
    };

    const edgesKeys = this.edges.keys();
    for (const node of edgesKeys) {
      if (!indices.has(node)) {
        visit(node);
      }
    }

    return found;
  }

  private static walk(opts: { dir: string }): string[] {
    const out: string[] = [];
    const dirEntries = readdirSync(opts.dir);
    for (const name of dirEntries) {
      const full = join(opts.dir, name);
      if (statSync(full).isDirectory()) {
        out.push(...ModuleGraph.walk({ dir: full }));
      } else if (full.endsWith('.js')) {
        out.push(full);
      }
    }
    return out;
  }

  private static resolveRelative(opts: { from: string; specifier: string }): string | undefined {
    if (!opts.specifier.startsWith('.')) {
      return undefined;
    }
    const base = resolve(dirname(opts.from), opts.specifier);
    const candidates = [base, `${base}.js`, join(base, 'index.js')];
    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return undefined;
  }
}

export class ModuleCyclesCheck {
  /**
   * `devz check module-cycles <dir> [--max <n>]`: prints the cycles of a built ESM directory and
   * returns 1 when there are more than `max` (no bound by default), 2 on a usage error.
   */
  static run(opts: {
    args: string[];
    print: (line: string) => void;
    printError: (line: string) => void;
  }): number {
    const { args, print, printError } = opts;
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: { max: { type: 'string' }, dist: { type: 'string' } },
    });
    const dir = values.dist ?? positionals[0];
    const usage = 'usage: devz check module-cycles <built ESM dir> [--max <n>]';
    if (!dir) {
      printError(usage);
      return 2;
    }

    let max = Number.POSITIVE_INFINITY;
    if (values.max !== undefined) {
      if (!/^\d+$/.test(values.max)) {
        printError(usage);
        return 2;
      }
      max = Number(values.max);
    }

    const cycles = ModuleGraph.fromDirectory({ dir }).cycles();
    print(`${dir}: ${cycles.length} cycle(s)`);
    for (const cycle of cycles) {
      print(`  - ${cycle.join(' <-> ')}`);
    }

    return cycles.length > max ? 1 : 0;
  }
}

/** @deprecated Use `ModuleCyclesCheck.run({ args, print, printError })`. Removed in 0.5. */
export const runModuleCycles = (opts: {
  args: string[];
  print: (line: string) => void;
  printError: (line: string) => void;
}): number => ModuleCyclesCheck.run(opts);
