/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The code theme of the doc pages, built from one colour: the wiki's accent on a dark window. Keywords
 * take the accent, types and functions take lighter tints of it, strings stay green, comments and
 * punctuation stay neutral, and an error is red. No violet and no orange that is not the product's own,
 * so a code block reads in the product's colour like the hero window does (tokens.css, home.css).
 * `config.mts` passes it as `markdown.theme`; pass the same value as `--accent-on-dark` in product.css.
 */
export type TCodeThemeOptions = {
  /** The accent on a dark ground, e.g. `#dead6a`. */
  accent: string;
};

const channel = (hex: string, at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);

/** `hex` blended towards white by `toward` (0 is `hex`, 1 is white). */
const tint = (hex: string, toward: number): string => {
  const parts = [1, 3, 5].map((at) =>
    Math.round(channel(hex, at) + (255 - channel(hex, at)) * toward),
  );

  return `#${parts.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

export const venziaCodeTheme = (opts: TCodeThemeOptions) => {
  const key = opts.accent;
  const type = tint(opts.accent, 0.45);
  const fn = tint(opts.accent, 0.7);
  const text = '#ffffffd9';
  const rules: [string[], string, string?][] = [
    [['keyword', 'storage', 'storage.type', 'keyword.control', 'keyword.operator.new'], key],
    [['string', 'string.quoted', 'punctuation.definition.string'], '#a5e3a0'],
    [['comment', 'punctuation.definition.comment'], '#ffffff66', 'italic'],
    [
      [
        'entity.name.function',
        'support.function',
        'meta.function-call',
        'meta.decorator',
        'entity.name.tag',
      ],
      fn,
    ],
    [
      [
        'entity.name.type',
        'entity.name.class',
        'support.type',
        'support.class',
        'entity.name.namespace',
      ],
      type,
    ],
    [['constant', 'constant.numeric', 'constant.language', 'support.constant'], type],
    [
      ['variable', 'variable.parameter', 'variable.other.property', 'meta.object-literal.key'],
      text,
    ],
    [['punctuation', 'meta.brace', 'keyword.operator'], '#ffffffb3'],
    [['invalid', 'markup.deleted'], '#ff9a9a'],
  ];

  return {
    name: 'venizia-product',
    type: 'dark' as const,
    colors: { 'editor.background': '#0e0e10', 'editor.foreground': text },
    tokenColors: rules.map(([scope, foreground, fontStyle]) => ({
      scope,
      settings: fontStyle ? { foreground, fontStyle } : { foreground },
    })),
  };
};
