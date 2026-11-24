import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { PublicSurface } from './public-surface';

/** Which of the two rules a rule module is: they read the same surface and the same baseline. */
type TUseWhenMode = 'require' | 'pending';

/**
 * `venizia/require-use-when` and `venizia/pending-use-when`. Every export of a package's public entry points that is a
 * value (a class, function, const, enum or namespace), and the framework types apps copy (`TNullable`, `ValueOrPromise`,
 * `TConstValue`...), carries a non-empty `@useWhen` in its TSDoc: plain words saying when to reach for it, so an author or an
 * agent who has never seen the API finds it. `@insteadOf`, when present, names what it replaces and is not empty. Other
 * types are optional: they point to their owner with `@see`.
 *
 * `baseline` is a JSON file (`{ "entries": ["src/a.ts#Name", ...] }`, paths from the package folder) listing the exports not
 * yet swept, so a package adopts the rule one folder at a time. Not in the baseline, a missing tag is an error
 * (`require-use-when`). In the baseline it is only a warning (`pending-use-when`), and a baseline entry that now has its tag
 * is an error: the file can only shrink. When the sweep ends the file is deleted and the option dropped.
 *
 * The entries are the package's `exports` mapped to source, or the `entries` option. An `export * as X from` statement
 * carries its tag on the statement.
 */
export class RequireUseWhenRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/require-use-when`;
  static readonly PENDING_NAME = `${HOUSE_PLUGIN_NAMESPACE}/pending-use-when`;

  /** The framework types apps shadow, which need the tag although they are types. */
  static readonly DEFAULT_TYPES: ReadonlyArray<string> = [
    'TNullable',
    'ValueOrPromise',
    'ValueOf',
    'TConstValue',
    'TClass',
    'TConstructor',
    'TAbstractConstructor',
  ];

  private static readBaseline(opts: { directory: string; baseline: unknown }): Set<string> {
    const { directory, baseline } = opts;
    const file = typeof baseline === 'string' ? resolve(directory, baseline) : undefined;

    if (!file || !existsSync(file)) {
      return new Set();
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      const entries = AstNode.readField({ node: parsed, key: 'entries' });

      return new Set(
        Array.isArray(entries) ? entries.filter((entry) => typeof entry === 'string') : [],
      );
      // eslint-disable-next-line venizia/no-silent-catch -- a baseline that does not parse exempts nothing: every gap is reported
    } catch {
      return new Set();
    }
  }

  private static strings(opts: { value: unknown }): Array<string> | undefined {
    return Array.isArray(opts.value)
      ? opts.value.filter((entry): entry is string => typeof entry === 'string')
      : undefined;
  }

  private static readonly SCHEMA = [
    {
      type: 'object',
      properties: {
        baseline: { type: 'string' },
        entries: { type: 'array', items: { type: 'string' } },
        types: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  ];

  private static create(opts: { mode: TUseWhenMode }) {
    const { mode } = opts;

    return (context: Rule.RuleContext): Rule.RuleListener => ({
      [AstNodeTypes.PROGRAM]: () => {
        const directory = PublicSurface.packageOf({ file: context.filename });

        if (directory === undefined) {
          return;
        }

        const options: unknown = context.options[0];
        const entries = RequireUseWhenRule.strings({
          value: AstNode.readField({ node: options, key: 'entries' }),
        });
        const types =
          RequireUseWhenRule.strings({
            value: AstNode.readField({ node: options, key: 'types' }),
          }) ?? RequireUseWhenRule.DEFAULT_TYPES;
        const baselined = RequireUseWhenRule.readBaseline({
          directory,
          baseline: AstNode.readField({ node: options, key: 'baseline' }),
        });
        const surface = PublicSurface.of({ directory, entries });

        for (const item of surface.get(resolve(context.filename)) ?? []) {
          const key = `${relative(directory, item.file).split(sep).join('/')}#${item.name}`;
          const isPending = baselined.has(key);
          const loc = {
            start: context.sourceCode.getLocFromIndex(item.start),
            end: context.sourceCode.getLocFromIndex(item.end),
          };
          const isRequired = item.isValue || types.includes(item.name);

          if (mode === 'pending') {
            if (isRequired && !item.hasUseWhen && isPending) {
              context.report({ loc, messageId: 'pending', data: { name: item.name } });
            }

            continue;
          }

          if (item.hasEmptyInsteadOf) {
            context.report({ loc, messageId: 'emptyInsteadOf', data: { name: item.name } });
          }

          if (isRequired && !item.hasUseWhen && !isPending) {
            context.report({ loc, messageId: 'missing', data: { name: item.name } });
          }

          if (isRequired && item.hasUseWhen && isPending) {
            context.report({ loc, messageId: 'stale', data: { name: item.name } });
          }
        }
      },
    });
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: RequireUseWhenRule.SCHEMA,
      messages: {
        missing:
          '`{{name}}` is public: add a `@useWhen` to its TSDoc, plain words for when to reach for it (and `@insteadOf` for what it replaces).',
        emptyInsteadOf:
          '`@insteadOf` on `{{name}}` is empty: name what it replaces, or remove the tag.',
        stale:
          '`{{name}}` has its `@useWhen`: remove it from the baseline file, which may only shrink.',
      },
    },
    create: RequireUseWhenRule.create({ mode: 'require' }),
  };

  static readonly PENDING_RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: RequireUseWhenRule.SCHEMA,
      messages: {
        pending:
          '`{{name}}` has no `@useWhen` yet: it is in the baseline of exports still to sweep.',
      },
    },
    create: RequireUseWhenRule.create({ mode: 'pending' }),
  };

  static build(
    opts: {
      severity?: TRuleSeverity;
      baseline?: string;
      entries?: ReadonlyArray<string>;
      types?: ReadonlyArray<string>;
    } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', baseline, entries, types } = opts;
    const options = {
      ...(baseline === undefined ? {} : { baseline }),
      ...(entries === undefined ? {} : { entries: [...entries] }),
      ...(types === undefined ? {} : { types: [...types] }),
    };

    return Object.keys(options).length === 0 ? [severity] : [severity, options];
  }
}
