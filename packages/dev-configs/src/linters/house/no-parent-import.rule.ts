import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** The `#src` import map of the package a file belongs to: its root and the directory `#src/*` points at. */
interface IImportMap {
  root: string;
  target: string;
}

/**
 * `venizia/no-parent-import`. An import that climbs out of its folder (`../x`) is written from the package's import map
 * instead (`#src/x`): it keeps its meaning when the file moves, and reads the same from every depth.
 *
 * The fix is made only when the nearest `package.json` maps `#src/*` to a folder and the import lands inside that folder;
 * every other finding is reported and left alone. A same-folder `./x` is never reported.
 */
export class NoParentImportRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-parent-import`;

  static readonly ALIAS = '#src';

  /** One scan reads the same package.json for every file of a package. */
  private static readonly maps = new Map<string, IImportMap | null>();

  /** A parsed JSON file (a package.json or a tsconfig without comments), or `undefined` when it cannot be read: a broken file never stops a lint run, the import is reported without a fix. */
  private static readManifest(opts: { file: string }): unknown {
    try {
      return JSON.parse(readFileSync(opts.file, 'utf8'));
      // eslint-disable-next-line venizia/no-silent-catch -- a package.json that does not parse only costs the autofix
    } catch {
      return undefined;
    }
  }

  /** The import map of the package that owns `directory`, or `undefined` when it has none for `#src/*`. */
  private static mapOf(opts: { directory: string }): IImportMap | undefined {
    const { directory } = opts;
    const cached = NoParentImportRule.maps.get(directory);

    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const manifest = join(directory, 'package.json');
    let found: IImportMap | undefined;

    if (existsSync(manifest)) {
      const parsed = NoParentImportRule.readManifest({ file: manifest });
      const imports = AstNode.readField({ node: parsed, key: 'imports' });
      const mapped = AstNode.readField({ node: imports, key: `${NoParentImportRule.ALIAS}/*` });
      const value =
        typeof mapped === 'string' ? mapped : AstNode.readField({ node: mapped, key: 'default' });

      // `./src/*` and the preset's `./src/*.js` both name the source folder.
      const folder =
        typeof value === 'string' ? /^(.*)\/\*(?:\.[a-z]+)?$/.exec(value)?.[1] : undefined;

      if (folder !== undefined) {
        found = { root: directory, target: resolve(directory, folder) };
      }

      // A package.json that has no map still ends the walk: the next one up belongs to another package.
      NoParentImportRule.maps.set(directory, found ?? null);

      return found;
    }

    const parent = dirname(directory);
    const inherited =
      parent === directory ? undefined : NoParentImportRule.mapOf({ directory: parent });
    NoParentImportRule.maps.set(directory, inherited ?? null);

    return inherited;
  }

  /** `#src/<path>` for the specifier `specifier` written in `filename`, when the map reaches it. */
  private static aliasFor(opts: { filename: string; specifier: string }): string | undefined {
    const map = NoParentImportRule.mapOf({ directory: dirname(opts.filename) });

    if (!map) {
      return undefined;
    }

    const absolute = resolve(dirname(opts.filename), opts.specifier);
    const inside = relative(map.target, absolute);

    if (inside === '' || inside.startsWith('..') || inside.startsWith(sep)) {
      return undefined;
    }

    return `${NoParentImportRule.ALIAS}/${inside.split(sep).join('/')}${NoParentImportRule.indexSuffix({ absolute, map })}`;
  }

  /**
   * `/index` when the target is a folder and the package cannot resolve a folder through `#src/*`. A package.json `imports`
   * map has no directory index, so `#src/folder` only resolves where the tsconfig `paths` entry `#src/*` also lists
   * `./src/*\/index`; elsewhere the fix writes the file out. A target that is a file, or not on disk, is left as written.
   */
  private static indexSuffix(opts: { absolute: string; map: IImportMap }): string {
    const { absolute, map } = opts;
    const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.json'];

    if (extensions.some((extension) => existsSync(`${absolute}${extension}`))) {
      return '';
    }

    const isFolder = ['index.ts', 'index.tsx', 'index.js'].some((name) =>
      existsSync(join(absolute, name)),
    );

    return isFolder && !NoParentImportRule.pathsResolveFolders({ root: map.root }) ? '/index' : '';
  }

  /** Whether the package's tsconfig `paths` maps `#src/*` to a folder index as well. */
  private static pathsResolveFolders(opts: { root: string }): boolean {
    const config = NoParentImportRule.readManifest({ file: join(opts.root, 'tsconfig.json') });
    const options = AstNode.readField({ node: config, key: 'compilerOptions' });
    const paths = AstNode.readField({
      node: AstNode.readField({ node: options, key: 'paths' }),
      key: `${NoParentImportRule.ALIAS}/*`,
    });

    return (
      Array.isArray(paths) &&
      paths.some((entry) => typeof entry === 'string' && entry.endsWith('/*/index'))
    );
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        parent:
          'Import from the package import map (`#src/...`), not from a parent folder (`{{specifier}}`).',
      },
    },
    create: (context) => {
      const check = (node: Rule.Node, opts: { fixable: boolean } = { fixable: true }) => {
        const source = AstNode.readField({ node, key: 'source' });
        const value = AstNode.readField({ node: source, key: 'value' });

        if (typeof value !== 'string' || (value !== '..' && !value.startsWith('../'))) {
          return;
        }

        const alias = NoParentImportRule.aliasFor({
          filename: context.filename,
          specifier: value,
        });

        context.report({
          node,
          messageId: 'parent',
          data: { specifier: value },
          fix:
            opts.fixable && alias !== undefined && AstNode.isNode(source)
              ? (fixer) => fixer.replaceText(source, `'${alias}'`)
              : null,
        });
      };

      return {
        [AstNodeTypes.IMPORT_DECLARATION]: (node: Rule.Node) => check(node),
        [AstNodeTypes.EXPORT_NAMED_DECLARATION]: (node: Rule.Node) => check(node),
        [AstNodeTypes.EXPORT_ALL_DECLARATION]: (node: Rule.Node) => check(node),
        // `import('../x')` is reported and left alone: its argument may be built, and the fix would not keep the laziness reading.
        [AstNodeTypes.IMPORT_EXPRESSION]: (node: Rule.Node) => check(node, { fixable: false }),
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'warn' } = opts;

    return [severity];
  }
}
