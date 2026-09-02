/**
 * SessionStart hook: prints the rules that cost the most when skipped. Everything is extracted from
 * `.agents/rules.md` at run time, never copied, so the digest cannot drift. Stdout becomes session context.
 */
const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const RULES = `${ROOT}/.agents/rules.md`;

const file = Bun.file(RULES);
if (!(await file.exists())) {
  // Never break a session over a missing digest.
  process.exit(0);
}

const lines = (await file.text()).split('\n');

/** The body of one `## ` section, up to the next `## ` heading. */
const section = (opts: { heading: string }): string[] => {
  const start = lines.findIndex(line => line.startsWith(`## ${opts.heading}`));
  if (start === -1) {
    return [];
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith('## '));

  return (end === -1 ? rest : rest.slice(0, end)).filter(line => line.trim() !== '');
};

/** The lines between two HTML-comment markers, markers excluded. */
const marked = (opts: { name: string }): string[] => {
  const start = lines.findIndex(line => line.includes(`<!-- ${opts.name}:start -->`));
  const end = lines.findIndex(line => line.includes(`<!-- ${opts.name}:end -->`));
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  return lines.slice(start + 1, end);
};

/** The contiguous markdown table starting at `start`. */
const tableAt = (opts: { start: number }): string[] => {
  const out: string[] = [];
  for (let index = opts.start; index < lines.length && lines[index].startsWith('|'); index++) {
    out.push(lines[index]);
  }

  return out;
};

const groupStart = lines.findIndex(line => line.startsWith('| Group'));
const groupTable = groupStart === -1 ? [] : tableAt({ start: groupStart });
const writeBoundaries = section({ heading: 'W - Write boundaries' }).filter(line =>
  line.startsWith('|'),
);

/** The rules sessions drop most, quoted from the rule file so they cannot drift. */
const OFTEN_DROPPED = ['P-09', 'P-10', 'B-03', 'B-05', 'P-05', 'P-15', 'W-02'];
const oftenDropped = OFTEN_DROPPED.map(id => lines.find(line => line.startsWith(`| **${id}**`))).filter(
  (line): line is string => Boolean(line),
);

const minimapShape = marked({ name: 'minimap-shape' });

console.log('# IGNIS project rules - read this before acting');
console.log();
console.log('The full rule set lives in `.agents/rules.md`. Facts live in `.agents/knowledge/`');
console.log('(query it with the `ignis-knowledge` MCP). Open the rule file itself before a task that');
console.log('touches an area you have not worked in this session - this digest is the floor, not the');
console.log('whole floor.');
console.log();
console.log(groupTable.join('\n'));
console.log();
console.log('## Write boundaries - the default is: produce the change, hand it over');
console.log();
console.log(writeBoundaries.join('\n'));

if (oftenDropped.length) {
  console.log();
  console.log('## The rules sessions drop most - reread these before writing anything');
  console.log();
  console.log('| ID | Rule |');
  console.log('|---|---|');
  console.log(oftenDropped.join('\n'));
}

if (minimapShape.length) {
  console.log();
  console.log('## The minimap (P-09) - every status message opens with it');
  console.log();
  console.log(minimapShape.join('\n'));
}
