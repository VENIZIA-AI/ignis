import { Glob } from 'bun';

/**
 * Guards dependency versions against the root `workspaces.catalog`.
 *
 * The catalog is the declared source of truth, but workspaces reference it with a LITERAL range,
 * never Bun's `catalog:` protocol: `packages/*` publish through `npm publish`, and npm ships
 * `catalog:` verbatim into the manifest, where it is unresolvable for every consumer.
 */

interface IProblem {
  file: string;
  message: string;
}

const WORKSPACE_GLOBS = ['packages/*/package.json', 'examples/*/package.json', 'docs/*/package.json'];

/** `peerDependencies` are compatibility statements for consumers and stay deliberately looser than the install range. */
const GUARDED_BLOCKS = ['dependencies', 'devDependencies'] as const;

const rootJson = JSON.parse(await Bun.file('package.json').text());
const catalog: Record<string, string> = rootJson.workspaces?.catalog ?? {};

if (Object.keys(catalog).length === 0) {
  console.error('check-catalog: no `workspaces.catalog` in the root package.json');
  process.exit(1);
}

const problems: Array<IProblem> = [];
const referenced = new Set<string>();

for (const pattern of WORKSPACE_GLOBS) {
  for await (const file of new Glob(pattern).scan('.')) {
    let json: Record<string, Record<string, string> | undefined>;

    try {
      json = JSON.parse(await Bun.file(file).text());
    } catch (error) {
      problems.push({ file, message: `invalid JSON - ${error instanceof Error ? error.message : error}` });
      continue;
    }

    for (const block of [...GUARDED_BLOCKS, 'peerDependencies'] as const) {
      for (const [dep, range] of Object.entries(json[block] ?? {})) {
        // npm ships this verbatim - it must never reach a manifest, in any block.
        if (range === 'catalog:') {
          problems.push({
            file,
            message: `${block}.${dep} uses "catalog:" - npm publishes it verbatim and consumers cannot resolve it; write the literal ${catalog[dep] ?? 'range'}`,
          });
          continue;
        }

        if (!GUARDED_BLOCKS.includes(block as (typeof GUARDED_BLOCKS)[number])) {
          continue;
        }

        if (!(dep in catalog)) {
          continue;
        }

        referenced.add(dep);

        if (range === catalog[dep]) {
          continue;
        }

        problems.push({
          file,
          message: `${block}.${dep} is "${range}" but the catalog pins "${catalog[dep]}" - align it, or change the catalog`,
        });
      }
    }
  }
}

// A catalog entry nobody references is dead weight that will drift out of date unnoticed.
for (const dep of Object.keys(catalog)) {
  if (referenced.has(dep)) {
    continue;
  }

  problems.push({ file: 'package.json', message: `catalog entry "${dep}" is referenced by no workspace - drop it` });
}

if (problems.length === 0) {
  console.log(`check-catalog: OK - ${Object.keys(catalog).length} entries, ${referenced.size} in use, no "catalog:" in any manifest`);
  process.exit(0);
}

console.error(`check-catalog: ${problems.length} problem(s):`);
for (const problem of problems) {
  console.error(`  ${problem.file}: ${problem.message}`);
}
process.exit(1);
