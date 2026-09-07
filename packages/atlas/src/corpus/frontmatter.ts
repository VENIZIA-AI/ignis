import { getError } from '@venizia/ignis-helpers/core';

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Splits YAML frontmatter from the body. No leading `---` block means no frontmatter - the whole
 * text is body. Invalid YAML throws instead of loading as `{}`: a caller decides whether to skip
 * the document, it never indexes silently under a blank title.
 */
export const parseFrontmatter = (opts: {
  text: string;
  path: string;
}): { data: Record<string, unknown>; body: string } => {
  const { text, path } = opts;
  const match = text.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { data: {}, body: text };
  }

  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(match[1]);
  } catch (error) {
    throw getError({
      message: `[parseFrontmatter] invalid YAML frontmatter | file: ${path} | ${messageOf(error)}`,
    });
  }

  return { data: isRecord(parsed) ? parsed : {}, body: text.slice(match[0].length) };
};
