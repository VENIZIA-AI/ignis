/**
 * Lists import cycles in a built ESM directory. bun turns every member of a cycle into a lazy
 * initializer, and a barrel `export *` over such a member can leave its exports undefined - the
 * compiled-binary failure of 2026-09-02. Usage: bun scripts/module-cycles.ts packages/helpers/dist/esm [--max 0]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const IMPORT_PATTERN = /(?:import|export)\s[^;]*?from\s+'([^']+)'|import\s+'([^']+)'/g;

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
      for (const match of text.matchAll(IMPORT_PATTERN)) {
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

      for (const next of this.edges.get(node) ?? []) {
        if (!indices.has(next)) {
          visit(next);
          lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(next)!));
        } else if (onStack.has(next)) {
          lowLinks.set(
            node,
            Math.min(lowLinks.get(node)!, indices.get(next)!),
          );
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

    for (const node of this.edges.keys()) {
      if (!indices.has(node)) {
        visit(node);
      }
    }

    return found;
  }

  private static walk(opts: { dir: string }): string[] {
    const out: string[] = [];
    for (const name of readdirSync(opts.dir)) {
      const full = join(opts.dir, name);
      if (statSync(full).isDirectory()) {
        out.push(...ModuleGraph.walk({ dir: full }));
      } else if (full.endsWith('.js')) {
        out.push(full);
      }
    }
    return out;
  }

  private static resolveRelative(opts: {
    from: string;
    specifier: string;
  }): string | undefined {
    if (!opts.specifier.startsWith('.')) {
      return undefined;
    }
    const base = resolve(dirname(opts.from), opts.specifier);
    for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return undefined;
  }
}

const run = (): number => {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { max: { type: 'string' } },
  });
  const dir = positionals[0];
  if (!dir) {
    console.error(
      'usage: bun scripts/module-cycles.ts <dist/esm dir> [--max <n>]',
    );
    return 2;
  }

  const cycles = ModuleGraph.fromDirectory({ dir }).cycles();
  console.log(`${dir}: ${cycles.length} cycle(s)`);
  for (const cycle of cycles) {
    console.log(`  - ${cycle.join(' <-> ')}`);
  }

  const max =
    values.max === undefined ? Number.POSITIVE_INFINITY : Number(values.max);
  return cycles.length > max ? 1 : 0;
};

if (import.meta.main) {
  process.exit(run());
}
