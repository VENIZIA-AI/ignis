/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * A small highlighter for the TypeScript samples of the home window: comments, strings, decorators,
 * keywords and types become spans with the classes `c s f k t` that home.css colours. The output is
 * escaped HTML, safe for v-html.
 */
const TOKEN =
  /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(@\w+)|\b(import|from|export|default|const|let|class|extends|return|new|await|async|type|satisfies|constructor|private|readonly|override|static|function|as)\b|\b([A-Z]\w*)\b/g;

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const highlight = (code: string): string => {
  let out = '';
  let last = 0;

  for (const match of code.matchAll(TOKEN)) {
    out += escapeHtml(code.slice(last, match.index));

    const [text, comment, string, decorator, keyword, type] = match;
    const cls = comment ? 'c' : string ? 's' : decorator ? 'f' : keyword ? 'k' : type ? 't' : '';

    out += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
    last = match.index + text.length;
  }

  return out + escapeHtml(code.slice(last));
};
