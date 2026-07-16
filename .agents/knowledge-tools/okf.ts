#!/usr/bin/env bun
/**
 * okf.ts - generator + conformance gate for the IGNIS OKF knowledge bundle.
 *
 *   bun .agents/knowledge-tools/okf.ts gen        # regenerate source-derived content
 *   bun .agents/knowledge-tools/okf.ts check      # CI gate: conformance + links + coverage + freshness
 *   bun .agents/knowledge-tools/okf.ts coverage   # measure the bundle against the source inventory
 *   bun .agents/knowledge-tools/okf.ts viz        # build the offline knowledge-graph explorer
 *   bun .agents/knowledge-tools/okf.ts mcp        # serve the bundle over MCP stdio
 *
 * Source-derived content is either a whole generated file (reference/*) or lives inside a
 * managed region delimited by `<!-- okf:generated:<id> start -->` … `<!-- okf:generated:<id> end -->`.
 * Everything else in the bundle is hand-authored and never touched.
 *
 * Repo-specific configuration lives in ./config.ts - not here.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  BUNDLE,
  EXAMPLE_DENYLIST,
  PACKAGE_DENYLIST,
  PATHS,
  PRUNE_DIRS,
  REPO,
  RESERVED_FILES,
} from './config.ts';
import { loadConcepts, stripCode } from './lib.ts';

// --- source scanning ---

const walkFiles = (opts: { dir: string }): string[] => {
  const { dir } = opts;

  const out: string[] = [];

  if (!existsSync(dir)) {
    return out;
  }

  for (const name of readdirSync(dir)) {
    if (PRUNE_DIRS.has(name)) {
      continue;
    }

    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...walkFiles({ dir: full }));
      continue;
    }

    out.push(full);
  }

  return out;
};

const listDirs = (opts: { dir: string }): string[] => {
  const { dir } = opts;

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => !PRUNE_DIRS.has(name) && statSync(join(dir, name)).isDirectory())
    .sort();
};

const sourceFiles = (opts: { dir: string }): string[] => {
  return walkFiles({ dir: opts.dir }).filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'));
};

const repoRelative = (opts: { path: string }): string => {
  return relative(REPO, opts.path);
};

export const packageDirs = (): string[] => {
  return listDirs({ dir: PATHS.packages }).filter((name) => !PACKAGE_DENYLIST.has(name));
};

export const exampleDirs = (): string[] => {
  return listDirs({ dir: PATHS.examples }).filter((name) => !EXAMPLE_DENYLIST.has(name));
};

// --- shared heuristics ---
// One extraction per fact, used by BOTH the renderer and the coverage counter. BANA drifted
// here (coverage counted `extends BaseService`, the renderer matched `export class *Service`),
// so the two disagreed; keep every axis single-sourced from these functions.

const exportedClasses = (opts: { dir: string; suffix: string }): string[] => {
  const { dir, suffix } = opts;

  const names = new Set<string>();
  const pattern = new RegExp(`export\\s+(?:abstract\\s+)?class\\s+(\\w+${suffix})\\b`, 'g');

  for (const file of sourceFiles({ dir })) {
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
};

type ComponentEntry = { dir: string; classes: string[] };

const collectComponents = (): ComponentEntry[] => {
  return listDirs({ dir: PATHS.coreComponents }).map((dir) => ({
    dir,
    classes: exportedClasses({ dir: join(PATHS.coreComponents, dir), suffix: 'Component' }),
  }));
};

type HelperEntry = { module: string; classes: string[] };

const collectHelperModules = (): HelperEntry[] => {
  return listDirs({ dir: PATHS.helpersModules }).map((module) => ({
    module,
    classes: exportedClasses({ dir: join(PATHS.helpersModules, module), suffix: 'Helper' }),
  }));
};

const collectHelperUtilities = (): string[] => {
  if (!existsSync(PATHS.helpersUtilities)) {
    return [];
  }

  return readdirSync(PATHS.helpersUtilities)
    .filter((name) => name.endsWith('.utility.ts'))
    .map((name) => name.replace(/\.utility\.ts$/, ''))
    .sort();
};

const collectBooters = (): string[] => {
  if (!existsSync(PATHS.bootBooters)) {
    return [];
  }

  return readdirSync(PATHS.bootBooters)
    .filter((name) => name.endsWith('.booter.ts'))
    .map((name) => name.replace(/\.booter\.ts$/, ''))
    .sort();
};

type BindingClass = { name: string; keys: { key: string; value: string }[] };

/** Const-classes of binding keys: `static readonly X = '...'` grouped by declaring class. */
const collectBindingKeys = (): BindingClass[] => {
  if (!existsSync(PATHS.coreBindings)) {
    return [];
  }

  const src = readFileSync(PATHS.coreBindings, 'utf8');
  const out: BindingClass[] = [];

  for (const cls of src.matchAll(/export\s+class\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
    const keys = [...cls[2].matchAll(/static\s+readonly\s+(\w+)\s*[:=][^'"`]*['"`]([^'"`]+)['"`]/g)].map(
      (match) => ({ key: match[1], value: match[2] }),
    );

    if (keys.length) {
      out.push({ name: cls[1], keys });
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
};

type MakeTarget = { name: string; deps: string; description: string };

const collectMakefileTargets = (): MakeTarget[] => {
  if (!existsSync(PATHS.makefile)) {
    return [];
  }

  const lines = readFileSync(PATHS.makefile, 'utf8').split('\n');
  const out: MakeTarget[] = [];

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!match) {
      continue;
    }

    // Description: the first `@echo "…"` of the recipe, stripped of emoji and trailing dots.
    let description = '';
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const line = lines[cursor];
      if (!line.startsWith('\t') && line.trim() !== '') {
        break;
      }

      const echo = line.match(/@echo\s+"([^"]*)"/);
      if (echo) {
        description = echo[1]
          .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
          .replace(/\.{3}$/, '')
          .trim();
        break;
      }
    }

    out.push({ name: match[1], deps: match[2].trim(), description });
  }

  return out;
};

type SourceMapEntry = { pkg: string; total: number; subsystems: { name: string; files: number }[] };

const collectSourceMap = (): SourceMapEntry[] => {
  const out: SourceMapEntry[] = [];

  for (const pkg of packageDirs()) {
    const src = join(PATHS.packages, pkg, 'src');
    if (!existsSync(src)) {
      continue;
    }

    const subsystems = listDirs({ dir: src })
      .filter((name) => name !== '__tests__')
      .map((name) => ({ name, files: sourceFiles({ dir: join(src, name) }).length }))
      .filter((entry) => entry.files > 0)
      .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));

    out.push({
      pkg,
      total: sourceFiles({ dir: src }).filter((file) => !file.includes('/__tests__/')).length,
      subsystems,
    });
  }

  return out;
};

/**
 * Bring prose lifted from outside the bundle in line with the repo docs style.
 *
 * package.json descriptions are npm-facing marketing copy: they carry em-dashes and spell the
 * brand "Ignis". The bundle is documentation, so it follows the docs rules (hyphen, always
 * "IGNIS") no matter where the text came from - and we do not rewrite package.json, which is
 * published to npm.
 */
const sanitizeProse = (opts: { text: string }): string => {
  return opts.text
    .replace(/\s*[—–]\s*/g, ' - ')
    .replace(/\bIgnis\b/g, 'IGNIS')
    .replace(/\s+/g, ' ')
    .trim();
};

/** First sentence only - manifest descriptions run to paragraph length and would wreck the table. */
const firstSentence = (opts: { text: string }): string => {
  const match = opts.text.match(/^(.*?[.!?])(\s|$)/);

  return (match ? match[1] : opts.text).trim();
};

const collectPackageManifests = (): { dir: string; name: string; description: string }[] => {
  const out: { dir: string; name: string; description: string }[] = [];

  for (const dir of packageDirs()) {
    const manifest = join(PATHS.packages, dir, 'package.json');
    if (!existsSync(manifest)) {
      continue;
    }

    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; description?: string };
    // Deliberately no `version` - it churns the bundle on every release.
    out.push({
      dir,
      name: parsed.name ?? dir,
      description: firstSentence({ text: sanitizeProse({ text: parsed.description ?? '' }) }),
    });
  }

  return out;
};

// --- managed regions ---

const markers = (opts: { id: string }): { start: string; end: string } => {
  return {
    start: `<!-- okf:generated:${opts.id} start -->`,
    end: `<!-- okf:generated:${opts.id} end -->`,
  };
};

/** Locate a managed region, rejecting malformed or duplicated markers rather than corrupting the file. */
const locateRegion = (opts: { text: string; id: string }): { start: string; end: string; startAt: number; endAt: number } => {
  const { text, id } = opts;

  const { start, end } = markers({ id });
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end);

  if (startAt === -1 || endAt === -1) {
    throw new Error(`managed region '${id}' not found`);
  }

  if (text.indexOf(start, startAt + 1) !== -1) {
    throw new Error(`managed region '${id}' has a duplicate start marker`);
  }

  if (text.indexOf(end, endAt + 1) !== -1) {
    throw new Error(`managed region '${id}' has a duplicate end marker`);
  }

  if (startAt + start.length > endAt) {
    throw new Error(`managed region '${id}' is malformed - end marker precedes start marker`);
  }

  return { start, end, startAt, endAt };
};

const replaceRegion = (opts: { text: string; id: string; body: string }): string => {
  const { text, id, body } = opts;

  const { start, startAt, endAt } = locateRegion({ text, id });

  return text.slice(0, startAt + start.length) + '\n' + body + '\n' + text.slice(endAt);
};

const extractRegion = (opts: { text: string; id: string }): string | null => {
  const { text, id } = opts;

  let located;
  try {
    located = locateRegion({ text, id });
  } catch (error) {
    console.warn(`okf: ${(error as Error).message}`);
    return null;
  }

  return text.slice(located.startAt + located.start.length, located.endAt).trim();
};

// --- renderers ---

type GeneratedFile = { path: string; content: string };

/**
 * OKF frontmatter for a generated reference file.
 * No `timestamp:` - it is optional in OKF, and a hardcoded one is a lie that also
 * makes every regeneration look like a change.
 */
const refHeader = (opts: { title: string; description: string; resource: string; tags: string }): string => {
  const { title, description, resource, tags } = opts;

  return [
    '---',
    'type: Reference',
    `title: ${title}`,
    `description: ${description}`,
    `resource: ${resource}`,
    `tags: [${tags}]`,
    '---',
    '',
    '',
  ].join('\n');
};

const generatedNote = (opts: { seeAlso: string }): string => {
  return `> Generated from source - do not edit; run \`make okf-gen\`. ${opts.seeAlso}\n\n`;
};

const renderSourceMap = (): GeneratedFile => {
  const entries = collectSourceMap();
  const total = entries.reduce((sum, entry) => sum + entry.total, 0);

  const body = entries
    .map((entry) => {
      const heading = `## ${entry.pkg}  (${entry.total} source files)`;

      // A package may keep a flat src/ (no subsystem dirs) - render prose, not an empty table.
      if (!entry.subsystems.length) {
        return [heading, '', '_Flat `src/` - no subsystem directories._'].join('\n');
      }

      const rows = entry.subsystems.map((sub) => `| \`${sub.name}/\` | ${sub.files} |`);

      return [heading, '', '| Subsystem | Files |', '|---|---|', ...rows].join('\n');
    })
    .join('\n\n');

  return {
    path: join(BUNDLE, 'reference/source-map.md'),
    content:
      refHeader({
        title: 'Source map',
        description: 'Every package subsystem under packages/*/src with its source-file count (generated).',
        resource: 'packages',
        tags: 'reference, source-map, packages',
      }) +
      generatedNote({ seeAlso: 'Layout: [monorepo layout](/overview/monorepo-layout.md).' }) +
      `**${total} source files across ${entries.length} packages.**\n\n` +
      body +
      '\n',
  };
};

const renderComponents = (): GeneratedFile => {
  const entries = collectComponents();
  const total = entries.reduce((sum, entry) => sum + entry.classes.length, 0);

  const rows = entries.map((entry) => {
    const classes = entry.classes.map((name) => `\`${name}\``).join(' · ') || '_(see source)_';

    return `| \`${entry.dir}/\` | ${classes} |`;
  });

  return {
    path: join(BUNDLE, 'reference/components.md'),
    content:
      refHeader({
        title: 'Components catalog',
        description: 'Every component under packages/core/src/components and its exported classes (generated).',
        resource: 'packages/core/src/components',
        tags: 'reference, components, core',
      }) +
      generatedNote({ seeAlso: 'Model: [component model](/architecture/component-model.md).' }) +
      `**${total} component classes across ${entries.length} component directories.**\n\n` +
      ['| Directory | Classes |', '|---|---|', ...rows].join('\n') +
      '\n',
  };
};

const renderHelpers = (): GeneratedFile => {
  const modules = collectHelperModules();
  const utilities = collectHelperUtilities();
  const total = modules.reduce((sum, entry) => sum + entry.classes.length, 0);

  const rows = modules.map((entry) => {
    const classes = entry.classes.map((name) => `\`${name}\``).join(' · ') || '_(see source)_';

    return `| \`${entry.module}/\` | ${classes} |`;
  });

  return {
    path: join(BUNDLE, 'reference/helpers.md'),
    content:
      refHeader({
        title: 'Helpers catalog',
        description: 'Every helper module and utility in packages/helpers (generated).',
        resource: 'packages/helpers/src',
        tags: 'reference, helpers, catalog',
      }) +
      generatedNote({ seeAlso: 'Package: [helpers](/packages/helpers.md).' }) +
      `**${total} helper classes across ${modules.length} modules, ${utilities.length} utilities.**\n\n` +
      ['## Modules', '', '| Module | Classes |', '|---|---|', ...rows].join('\n') +
      '\n\n## Utilities\n\n' +
      (utilities.map((name) => `\`${name}\``).join(' · ') || '-') +
      '\n',
  };
};

const renderBindingKeys = (): GeneratedFile => {
  const classes = collectBindingKeys();
  const total = classes.reduce((sum, entry) => sum + entry.keys.length, 0);

  const body = classes
    .map((entry) => {
      const rows = entry.keys.map((key) => `| \`${key.key}\` | \`${key.value}\` |`);

      return [`## ${entry.name}`, '', '| Constant | Key |', '|---|---|', ...rows].join('\n');
    })
    .join('\n\n');

  return {
    path: join(BUNDLE, 'reference/binding-keys.md'),
    content:
      refHeader({
        title: 'Binding keys',
        description: 'Every dependency-injection binding key declared in core (generated).',
        resource: 'packages/core/src/common/bindings.ts',
        tags: 'reference, bindings, di',
      }) +
      generatedNote({ seeAlso: 'Namespaces: [binding key namespaces](/conventions/binding-key-namespaces.md).' }) +
      `**${total} keys across ${classes.length} binding classes.**\n\n` +
      (body || '_(none found)_') +
      '\n',
  };
};

const renderMakefileTargets = (): GeneratedFile => {
  const targets = collectMakefileTargets();

  const rows = targets.map((target) => {
    return `| \`make ${target.name}\` | ${target.deps ? `\`${target.deps}\`` : '-'} | ${target.description || '-'} |`;
  });

  return {
    path: join(BUNDLE, 'reference/makefile-targets.md'),
    content:
      refHeader({
        title: 'Makefile targets',
        description: 'Every make target, its prerequisites, and what it does (generated).',
        resource: 'Makefile',
        tags: 'reference, make, build',
      }) +
      generatedNote({ seeAlso: 'Playbook: [build system](/process/build-system.md).' }) +
      `**${targets.length} targets.**\n\n` +
      ['| Target | Depends on | Description |', '|---|---|---|', ...rows].join('\n') +
      '\n',
  };
};

/** Whole generated files. Add a renderer here and `gen`/`check` pick it up automatically. */
const RENDERERS: { id: string; render: () => GeneratedFile }[] = [
  { id: 'source-map', render: renderSourceMap },
  { id: 'components', render: renderComponents },
  { id: 'helpers', render: renderHelpers },
  { id: 'binding-keys', render: renderBindingKeys },
  { id: 'makefile-targets', render: renderMakefileTargets },
];

const renderPackagesTable = (): string => {
  const rows = collectPackageManifests().map((entry) => {
    return `| [\`${entry.dir}\`](/packages/${entry.dir}.md) | \`${entry.name}\` | ${entry.description || '-'} |`;
  });

  return ['| Package | npm name | Description |', '|---|---|---|', ...rows].join('\n');
};

/** Managed regions inside hand-authored files. */
const REGIONS: { id: string; file: string; render: () => string }[] = [
  { id: 'packages-table', file: join(BUNDLE, 'overview/monorepo-layout.md'), render: renderPackagesTable },
];

// --- docs style ---

/**
 * Repo docs rules, enforced on prose (see check step 3). To write a forbidden literal - as the
 * concept defining these rules must - put it in a code span; `stripCode` removes those first.
 */
const STYLE_RULES: { pattern: RegExp; message: string }[] = [
  { pattern: /[—–]/, message: 'use a hyphen, not an em-dash or en-dash' },
  { pattern: /\bIgnis\b/, message: 'the brand is always written IGNIS' },
];

// --- freshness ---

/** Compare generated content ignoring trailing whitespace, so an editor's final newline is not "stale". */
const sameContent = (opts: { left: string; right: string }): boolean => {
  const normalize = (value: string) =>
    value
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .trim();

  return normalize(opts.left) === normalize(opts.right);
};

// --- commands ---

const gen = (): void => {
  for (const region of REGIONS) {
    if (!existsSync(region.file)) {
      console.warn(`gen: skipped region '${region.id}' - ${repoRelative({ path: region.file })} does not exist yet`);
      continue;
    }

    const next = replaceRegion({
      text: readFileSync(region.file, 'utf8'),
      id: region.id,
      body: region.render(),
    });

    writeFileSync(region.file, next);
    console.log(`gen: wrote region '${region.id}' (${repoRelative({ path: region.file })})`);
  }

  for (const renderer of RENDERERS) {
    const { path, content } = renderer.render();

    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    console.log(`gen: wrote ${repoRelative({ path })}`);
  }
};

const check = (): void => {
  const problems: string[] = [];
  const files = walkFiles({ dir: BUNDLE }).filter((file) => file.endsWith('.md'));
  const ids = new Set(files.map((file) => '/' + relative(BUNDLE, file)));

  let conceptCount = 0;

  // 1. conformance + 2. links
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const base = file.split('/').pop() ?? '';
    const reserved = RESERVED_FILES.has(base);

    if (!reserved) {
      conceptCount++;

      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatter) {
        problems.push(`${repoRelative({ path: file })}: no frontmatter`);
      } else if (!/\btype:\s*\S/.test(frontmatter[1])) {
        problems.push(`${repoRelative({ path: file })}: missing/empty type`);
      }
    }

    // Links inside code fences are examples, not edges - strip before validating.
    for (const match of stripCode({ text }).matchAll(/\]\((\/[^)\s]+\.md)\)/g)) {
      if (!ids.has(match[1])) {
        problems.push(`${repoRelative({ path: file })}: broken link -> ${match[1]}`);
      }
    }
  }

  // 3. docs style - hyphen not dash, brand always IGNIS.
  // Checked on prose only: code spans and fences are stripped first, so the concept that DEFINES
  // these rules can still quote the forms it forbids by wrapping them in backticks.
  for (const file of files) {
    const prose = stripCode({ text: readFileSync(file, 'utf8') });

    for (const rule of STYLE_RULES) {
      const match = prose.match(rule.pattern);
      if (match) {
        problems.push(`${repoRelative({ path: file })}: ${rule.message} (found "${match[0]}")`);
      }
    }
  }

  // 4. structural coverage - every package and example has a curated concept
  for (const [items, section] of [
    [packageDirs(), 'packages'],
    [exampleDirs(), 'examples'],
  ] as const) {
    for (const name of items) {
      if (!ids.has(`/${section}/${name}.md`)) {
        problems.push(`coverage: ${section}/${name} has no concept (${section}/${name}.md)`);
      }
    }
  }

  // 5. freshness - generated content matches source
  for (const region of REGIONS) {
    if (!existsSync(region.file)) {
      problems.push(`freshness: region '${region.id}' host file missing (${repoRelative({ path: region.file })})`);
      continue;
    }

    const actual = extractRegion({ text: readFileSync(region.file, 'utf8'), id: region.id });
    if (actual === null || !sameContent({ left: actual, right: region.render() })) {
      problems.push(`freshness: region '${region.id}' is stale - run \`make okf-gen\``);
    }
  }

  for (const renderer of RENDERERS) {
    const { path, content } = renderer.render();
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';

    if (!sameContent({ left: current, right: content })) {
      problems.push(`freshness: ${repoRelative({ path })} is stale - run \`make okf-gen\``);
    }
  }

  if (problems.length) {
    console.error(`check: ${problems.length} problem(s):\n` + problems.map((problem) => '  - ' + problem).join('\n'));
    process.exit(1);
  }

  console.log(`check: OK - ${files.length} files, ${conceptCount} concepts, all conform`);
};

// --- coverage ---

const percent = (opts: { value: number; total: number }): number => {
  return opts.total ? Math.round((opts.value / opts.total) * 100) : 100;
};

const pad = (opts: { value: string; width: number }): string => {
  return (opts.value + ' '.repeat(opts.width)).slice(0, opts.width);
};

const coverage = (): void => {
  const concepts = loadConcepts().filter((concept) => !concept.reserved);
  const ids = new Set(concepts.map((concept) => concept.id));

  const hasId = (opts: { id: string }): boolean => ids.has(opts.id);
  const hasPrefix = (opts: { prefix: string }): boolean =>
    [...ids].some((id) => id === opts.prefix || id.startsWith(opts.prefix + '/'));

  const lines: string[] = [];
  let structCovered = 0;
  let structTotal = 0;

  const struct = (opts: { name: string; items: string[]; covered: (item: string) => boolean }): void => {
    const { name, items, covered } = opts;

    const missing = items.filter((item) => !covered(item));
    const value = items.length - missing.length;

    structCovered += value;
    structTotal += items.length;

    lines.push(
      `  ${pad({ value: name, width: 15 })} ${pad({ value: `${value}/${items.length}`, width: 8 })} ` +
        `${pad({ value: percent({ value, total: items.length }) + '%', width: 5 })}` +
        (missing.length ? `  missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}` : ''),
    );
  };

  lines.push('STRUCTURAL  (target 100% - one curated concept each)');
  struct({ name: 'packages', items: packageDirs(), covered: (name) => hasId({ id: '/packages/' + name }) });
  struct({ name: 'examples', items: exampleDirs(), covered: (name) => hasId({ id: '/examples/' + name }) });

  // Reference axes - advisory; exhaustive coverage comes from generation.
  lines.push('', 'REFERENCE  (advisory - generated)');
  const ref = (opts: { name: string; count: number; generated: boolean }): void => {
    lines.push(
      `  ${pad({ value: opts.name, width: 15 })} ${pad({ value: String(opts.count), width: 6 })}  ` +
        `${opts.generated ? 'generated ✓' : 'NOT generated'}`,
    );
  };

  const components = collectComponents();
  const helperModules = collectHelperModules();
  const bindingClasses = collectBindingKeys();

  ref({
    name: 'components',
    count: components.reduce((sum, entry) => sum + entry.classes.length, 0),
    generated: hasId({ id: '/reference/components' }),
  });
  ref({
    name: 'helper modules',
    count: helperModules.length,
    generated: hasId({ id: '/reference/helpers' }),
  });
  ref({ name: 'booters', count: collectBooters().length, generated: hasPrefix({ prefix: '/packages/boot' }) });
  ref({
    name: 'binding keys',
    count: bindingClasses.reduce((sum, entry) => sum + entry.keys.length, 0),
    generated: hasId({ id: '/reference/binding-keys' }),
  });
  ref({ name: 'make targets', count: collectMakefileTargets().length, generated: hasId({ id: '/reference/makefile-targets' }) });
  ref({
    name: 'source files',
    count: collectSourceMap().reduce((sum, entry) => sum + entry.total, 0),
    generated: hasId({ id: '/reference/source-map' }),
  });

  // Knowledge types (Diátaxis / arc42).
  const types: Record<string, number> = {};
  for (const concept of concepts) {
    types[concept.type] = (types[concept.type] || 0) + 1;
  }

  const playbookTarget = packageDirs().length;

  lines.push('', 'KNOWLEDGE TYPES  (Diátaxis / arc42)');
  lines.push(
    '  ' +
      Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type}:${count}`)
        .join('  '),
  );
  lines.push(
    `  how-to (Playbook) ${types['Playbook'] || 0}  (target >= ${playbookTarget})` +
      `${(types['Playbook'] || 0) < playbookTarget ? '  <- gap' : ''}`,
  );
  lines.push(`  tutorial ${types['Tutorial'] || 0}  (target 1)${!types['Tutorial'] ? '  <- gap' : ''}`);
  lines.push(`  glossary ${types['Glossary'] || 0}  (target 1)${!types['Glossary'] ? '  <- gap' : ''}`);

  console.log(`\nCOVERAGE - ${concepts.length} curated concepts\n`);
  console.log(lines.join('\n'));
  console.log(`\nstructural: ${structCovered}/${structTotal}  ${percent({ value: structCovered, total: structTotal })}%`);

  const minIndex = process.argv.indexOf('--min');
  if (minIndex === -1) {
    return;
  }

  // `--min 0` must mean 0. `Number(x) || 100` silently turned a valid 0 into 100.
  const raw = process.argv[minIndex + 1];
  const min = Number(raw);

  if (raw === undefined || !Number.isFinite(min)) {
    console.error(`\ncoverage: --min needs a number, got ${raw === undefined ? '(nothing)' : `"${raw}"`}`);
    process.exit(2);
  }

  const structPercent = percent({ value: structCovered, total: structTotal });
  if (structPercent < min) {
    console.error(`\ncoverage gate FAILED: structural ${structPercent}% < ${min}%`);
    process.exit(1);
  }
};

// ---

const command = process.argv[2];

switch (command) {
  case 'gen': {
    gen();
    break;
  }

  case 'check': {
    check();
    break;
  }

  case 'coverage': {
    coverage();
    break;
  }

  case 'viz': {
    await (await import('./viz.ts')).buildViz();
    break;
  }

  case 'mcp': {
    await (await import('./mcp.ts')).runMcp();
    break;
  }

  default: {
    console.error('usage: bun .agents/knowledge-tools/okf.ts <gen|check|coverage|viz|mcp>');
    process.exit(2);
  }
}
