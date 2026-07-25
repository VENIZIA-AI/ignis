import { Glob } from 'bun';

/** Guards the workspace catalog: a catalogued dependency must be referenced as `catalog:`, never as a literal range. */

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

    for (const block of GUARDED_BLOCKS) {
      for (const [dep, range] of Object.entries(json[block] ?? {})) {
        if (!(dep in catalog)) {
          continue;
        }

        if (range === 'catalog:') {
          referenced.add(dep);
          continue;
        }

        problems.push({
          file,
          message: `${block}.${dep} is "${range}" but the catalog owns it - use "catalog:" (catalog pins ${catalog[dep]})`,
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
  console.log(`check-catalog: OK - ${Object.keys(catalog).length} entries, ${referenced.size} referenced`);
  process.exit(0);
}

console.error(`check-catalog: ${problems.length} problem(s):`);
for (const problem of problems) {
  console.error(`  ${problem.file}: ${problem.message}`);
}
process.exit(1);
