/**
 * lib.ts - shared loader/parser for the OKF knowledge bundle.
 * Used by the generator, the viz builder, and the MCP server.
 *
 * Repo-specific paths and denylists live in ./config.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { BUNDLE, PRUNE_DIRS, RESERVED_FILES } from './config.ts';

export { REPO, BUNDLE } from './config.ts';

export type Concept = {
  id: string; // bundle-relative, leading slash, no extension - e.g. "/packages/core"
  file: string; // absolute path
  type: string;
  title: string;
  description: string;
  resource: string; // frontmatter `resource:` - the source path/URL this concept covers
  tags: string[];
  body: string; // markdown after frontmatter
  raw: string; // untouched file content, frontmatter included
  links: string[]; // ids this concept links to
  reserved: boolean; // index.md / log.md
};

// ---

const walkMarkdown = (opts: { dir: string }): string[] => {
  const { dir } = opts;

  const out: string[] = [];

  for (const name of readdirSync(dir)) {
    if (PRUNE_DIRS.has(name)) {
      continue;
    }

    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...walkMarkdown({ dir: full }));
      continue;
    }

    if (full.endsWith('.md')) {
      out.push(full);
    }
  }

  return out;
};

/**
 * Strip fenced and inline code before scanning for links.
 *
 * A markdown link inside a code fence is an example, not a real edge: leaving it in
 * made `check` report broken links for illustrative snippets and made viz draw edges
 * that do not exist. Fences are replaced (not deleted) so nothing outside them shifts.
 */
export const stripCode = (opts: { text: string }): string => {
  return opts.text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length));
};

export const extractLinks = (opts: { text: string }): string[] => {
  const prose = stripCode({ text: opts.text });

  return [...new Set([...prose.matchAll(/\]\((\/[^)\s]+)\.md\)/g)].map((link) => link[1]))];
};

/**
 * Split OKF frontmatter from the body.
 *
 * Parsing is delegated to `Bun.YAML.parse` rather than a hand-rolled regex: the regex
 * version mis-read tags containing commas and quoted values carrying `:`.
 */
export const parseFrontmatter = (opts: { text: string; file: string }): {
  data: Record<string, unknown>;
  body: string;
} => {
  const { text, file } = opts;

  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: text };
  }

  let data: Record<string, unknown> = {};

  try {
    const parsed = Bun.YAML.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn(`lib: invalid YAML frontmatter in ${file} - ${(error as Error).message}`);
  }

  return { data, body: match[2] };
};

const asString = (opts: { value: unknown; fallback: string }): string => {
  return typeof opts.value === 'string' ? opts.value : opts.fallback;
};

const asTags = (opts: { value: unknown }): string[] => {
  const { value } = opts;

  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

export const loadConcepts = (): Concept[] => {
  return walkMarkdown({ dir: BUNDLE }).map((file) => {
    const raw = readFileSync(file, 'utf8');
    const base = file.split('/').pop() ?? '';
    const reserved = RESERVED_FILES.has(base);

    const { data, body } = parseFrontmatter({ text: raw, file });
    const id = '/' + relative(BUNDLE, file).replace(/\.md$/, '');

    return {
      id,
      file,
      type: asString({ value: data.type, fallback: reserved ? 'Index' : 'Unknown' }),
      title: asString({ value: data.title, fallback: base.replace(/\.md$/, '') }),
      description: asString({ value: data.description, fallback: '' }),
      resource: asString({ value: data.resource, fallback: '' }),
      tags: asTags({ value: data.tags }),
      body: body.trim(),
      raw,
      links: extractLinks({ text: raw }),
      reserved,
    };
  });
};

/** Normalize a user-supplied id to canonical form ("/packages/core"). */
export const normalizeId = (opts: { raw: string }): string => {
  let id = opts.raw.trim().replace(/\.md$/, '');

  if (!id.startsWith('/')) {
    id = '/' + id;
  }

  return id;
};
