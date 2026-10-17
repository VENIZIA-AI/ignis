/**
 * SessionStart hook, after VULCAN's base digest. The base digest already prints every rule row of
 * `.agents/rules.md`, so this adds only what it cannot: which IGNIS rules sessions drop most, and the
 * minimap shape (P-09). Both are extracted from `.agents/rules.md` at run time, never copied, so the
 * digest cannot drift. Stdout becomes session context.
 */
const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const RULES = `${ROOT}/.agents/rules.md`;

const file = Bun.file(RULES);
if (!(await file.exists())) {
  // Never break a session over a missing digest.
  process.exit(0);
}

const lines = (await file.text()).split('\n');

/** The lines between two HTML-comment markers, markers excluded. */
const marked = (opts: { name: string }): string[] => {
  const start = lines.findIndex(line => line.includes(`<!-- ${opts.name}:start -->`));
  const end = lines.findIndex(line => line.includes(`<!-- ${opts.name}:end -->`));
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  return lines.slice(start + 1, end);
};

/** The rules sessions drop most. Only the IDs that still exist in the rule file are named. */
const OFTEN_DROPPED = ['P-09', 'P-10', 'B-03', 'B-05', 'P-05', 'P-15', 'W-02'];
const oftenDropped = OFTEN_DROPPED.filter(id => lines.some(line => line.startsWith(`| **${id}**`)));

const minimapShape = marked({ name: 'minimap-shape' });

console.log('# IGNIS - what sessions drop most');
console.log();
console.log('The rule rows are in the digest above. Facts live in `.agents/knowledge/` (query them');
console.log('with the `ignis-atlas` MCP server).');

if (oftenDropped.length) {
  console.log();
  console.log(`Reread these before writing anything: ${oftenDropped.join(', ')}.`);
}

if (minimapShape.length) {
  console.log();
  console.log('## The minimap (P-09) - every status message opens with it');
  console.log();
  console.log(minimapShape.join('\n'));
}
