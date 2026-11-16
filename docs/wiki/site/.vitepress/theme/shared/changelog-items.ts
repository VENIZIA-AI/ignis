/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The items of a version folder's `log.md` as the version page shows them: `- **Title** \`id\` (\`@pkg\`): prose`, under the
 * sections Breaking, Deprecated, Added, Changed, Fixed and Security. The prose becomes HTML here, at build time, by a small
 * renderer that knows code, bold, links and paragraphs and escapes everything else, so the page needs no markdown engine and
 * a log can never put markup into it. This file is pure (no VitePress import) so a test can run it.
 */
export const SECTION_NAMES = [
  'Breaking',
  'Deprecated',
  'Added',
  'Changed',
  'Fixed',
  'Security',
] as const;

export type TSectionName = (typeof SECTION_NAMES)[number];

export type TVersionItem = {
  /** The id in the code span after the title: the anchor of the item, and the id of its migration block. */
  id: string;
  title: string;
  /** The title as HTML (it may hold code). */
  titleHtml: string;
  section: TSectionName;
  /** The npm names after the id; empty when the item belongs to the file's packages. */
  packages: string[];
  /** The prose as HTML. */
  html: string;
};

const ITEM_LINE = /^- \*\*(.+?)\*\* `([^`]+)`(?: \(([^)]*)\))?:?\s?(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SECTION_LINE = /^## (.+?)\s*$/;
const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
/** The targets a link may have: a web address, a path of the site, or an anchor. Anything else is text. */
const SAFE_TARGET = /^(?:https?:\/\/|\/(?!\/)|#)/;

/** Text as HTML: `&`, `<` and `>` escaped. */
export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown as HTML: code spans, bold and links; every other character is text. */
export const renderInline = (opts: { text: string }): string =>
  opts.text
    // the wiki writes a template-looking code span as `<code v-pre>`; here it is a plain code span
    .replace(/<code v-pre>([\s\S]*?)<\/code>/g, '`$1`')
    .split(/(`[^`]+`)/)
    .map((part, index) => {
      if (index % 2 === 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      return escapeHtml(part)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(LINK, (_match, label: string, target: string) =>
          // the text is escaped already, so the target is too: only the quote that would end the attribute is left
          SAFE_TARGET.test(target)
            ? `<a href="${target.replace(/"/g, '&quot;')}">${label}</a>`
            : label,
        );
    })
    .join('');

/** Paragraphs split on blank lines, a block of `- ` lines as a list, a fenced block as a code block. */
export const renderParagraphs = (opts: { text: string }): string => {
  const blocks: string[] = [];
  let lines: string[] = [];
  let fence: string | null = null;
  let code: string[] = [];
  const flush = (): void => {
    if (lines.length === 0) {
      return;
    }

    blocks.push(
      lines.every((line) => /^\s*- /.test(line))
        ? `<ul>${lines.map((line) => `<li>${renderInline({ text: line.replace(/^\s*- /, '') })}</li>`).join('')}</ul>`
        : `<p>${renderInline({ text: lines.map((line) => line.trim()).join(' ') })}</p>`,
    );
    lines = [];
  };

  for (const line of opts.text.split('\n')) {
    const mark = FENCE.exec(line)?.[1];

    if (fence !== null) {
      if (mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length) {
        blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        fence = null;
        code = [];
      } else {
        code.push(line);
      }
    } else if (mark !== undefined) {
      flush();
      fence = mark;
    } else if (line.trim() === '') {
      flush();
    } else {
      lines.push(line);
    }
  }

  if (fence !== null) {
    blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  }

  flush();

  return blocks.join('');
};

/** The items of `src` (a whole `log.md`), in file order; a bullet inside a code fence is not one. */
export const parseItems = (opts: { src: string }): TVersionItem[] => {
  const body = opts.src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const items: TVersionItem[] = [];
  let section: TSectionName | undefined;
  let fence: string | null = null;
  let current: { head: RegExpExecArray; lines: string[] } | undefined;
  const close = (): void => {
    if (current === undefined || section === undefined) {
      current = undefined;

      return;
    }

    const [, title, id, packages = '', first = ''] = current.head;
    const prose = [first, ...current.lines.map((line) => line.replace(/^ {1,2}/, ''))]
      .join('\n')
      .trim();

    items.push({
      id,
      title: title.replace(/`/g, ''),
      titleHtml: renderInline({ text: title }),
      section,
      packages: [...packages.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
      html: renderParagraphs({ text: prose }),
    });
    current = undefined;
  };

  for (const line of body.split(/\r?\n/)) {
    const mark = FENCE.exec(line)?.[1];

    if (fence !== null) {
      if (mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length) {
        fence = null;
      }

      current?.lines.push(line);
      continue;
    }

    if (mark !== undefined) {
      fence = mark;
      current?.lines.push(line);
      continue;
    }

    const heading = SECTION_LINE.exec(line);

    if (heading !== null) {
      close();
      section = SECTION_NAMES.find((name) => name === heading[1]);
      continue;
    }

    const head = ITEM_LINE.exec(line);

    if (head !== null && section !== undefined) {
      close();
      current = { head, lines: [] };
      continue;
    }

    current?.lines.push(line);
  }

  close();

  return items;
};

/** The count of items per section, in the order of the sections, leaving out an empty one. */
export const countSections = (opts: { items: TVersionItem[] }): [TSectionName, number][] =>
  SECTION_NAMES.map((name): [TSectionName, number] => [
    name,
    opts.items.filter((item) => item.section === name).length,
  ]).filter(([, count]) => count > 0);

/** The first sentence of a paragraph of plain text: up to the first full stop, or all of it. */
export const firstSentence = (opts: { text: string }): string =>
  /^(.+?[.!?])(?:\s|$)/s.exec(opts.text.trim())?.[1] ?? opts.text.trim();

/** An npm name without its scope: `@venizia/ignis-kernel` is `ignis-kernel`. */
export const shortPackage = (opts: { name: string }): string => opts.name.replace(/^@[^/]+\//, '');
