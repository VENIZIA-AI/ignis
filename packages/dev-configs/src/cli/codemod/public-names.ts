import { ClassRenames, ClassRenamesCommand } from './class-renames';
import type { IClassRename, ICodemodRewrite, IFileCodemod } from './class-renames';
import { GUARD_MAPPINGS } from './namespace-functions/mappings/guards';
import { NamespaceFunctions } from './namespace-functions/rewriter';

const USAGE = `Usage: devz codemod public-names [paths...] [--write [--all] | --check]

One run for the public renames of types and type guards:

  - ValueOf -> TValueOf, ValueOrPromise -> TValueOrPromise, TConstructor -> TClass,
    TAbstractConstructor -> TAbstractClass, imported from @venizia/ignis-inversion, @venizia/ignis-helpers
    (and /common) or @venizia/ignis. An aliased import keeps its alias.
  - IScopedCasbinPolicyFilter -> ICasbinPolicyFilter, imported from @venizia/ignis.
  - a type guard function becomes a static method of the same name, such as isPromiseLike(value) ->
    Execution.isPromiseLike(value). The table is in namespace-functions/mappings/guards.ts.

A name your file declares itself, or imports from another package, is left alone. It reads .ts, .tsx, .mts and
.cts files. It lists, with the line, and leaves to you: a guard used as a value (passed to filter, in typeof),
a re-export or a type-only import of a guard, a type whose name is declared again further down the file, an
"import x = require('...')" that reaches an old name through x. It does
not list, so run your typecheck afterwards: .js files, import('pkg').Name, a guard read from a namespace import
of a package that does not export its class, and a name that reaches a file through a barrel of your own.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change or a line is left to you (for CI)
  --help     print this text and exit

There is no --reverse: TConstructor and TClass became one name.`;

/** The packages that export the renamed types; their sub-paths count. */
const TYPE_PACKAGES = ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis'];

export class PublicNamesTable {
  static readonly TYPE_ROWS: ReadonlyArray<IClassRename> = [
    { oldName: 'ValueOf', newName: 'TValueOf', packages: TYPE_PACKAGES },
    { oldName: 'ValueOrPromise', newName: 'TValueOrPromise', packages: TYPE_PACKAGES },
    { oldName: 'TConstructor', newName: 'TClass', packages: TYPE_PACKAGES },
    { oldName: 'TAbstractConstructor', newName: 'TAbstractClass', packages: TYPE_PACKAGES },
    {
      oldName: 'IScopedCasbinPolicyFilter',
      newName: 'ICasbinPolicyFilter',
      packages: ['@venizia/ignis'],
    },
  ];
}

export class PublicNames {
  /** Whether `specifier` exports `name` as one of the old names this codemod moves. */
  private static isOldName(opts: { specifier: string; name: string }): boolean {
    const { specifier, name } = opts;

    return (
      GUARD_MAPPINGS.some(
        (mapping) => mapping.oldName === name && mapping.modules.includes(specifier),
      ) ||
      PublicNamesTable.TYPE_ROWS.some(
        (row) =>
          row.oldName === name &&
          row.packages.some((owner) => specifier === owner || specifier.startsWith(`${owner}/`)),
      )
    );
  }

  /** The `import x = require('...')` lines of a `.cts` file whose `x` reaches an old name: neither pass rewrites them. */
  private static findRequireImports(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): ICodemodRewrite['manual'] {
    const { typescript: ts, fileName, source } = opts;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const reached = new Map<string, Set<string>>();

    const walk = (node: import('typescript').Node): void => {
      const pair = ts.isPropertyAccessExpression(node)
        ? [node.expression, node.name]
        : ts.isQualifiedName(node)
          ? [node.left, node.right]
          : undefined;
      const [scope, member] = pair ?? [];

      if (scope && member && ts.isIdentifier(scope)) {
        reached.set(scope.text, (reached.get(scope.text) ?? new Set()).add(member.getText(file)));
      }

      ts.forEachChild(node, walk);
    };

    walk(file);

    return file.statements.flatMap((statement) => {
      if (
        !ts.isImportEqualsDeclaration(statement) ||
        !ts.isExternalModuleReference(statement.moduleReference) ||
        !ts.isStringLiteralLike(statement.moduleReference.expression)
      ) {
        return [];
      }

      const specifier = statement.moduleReference.expression.text;
      const names = [...(reached.get(statement.name.text) ?? [])].filter((name) =>
        PublicNames.isOldName({ specifier, name }),
      );

      if (names.length === 0) {
        return [];
      }

      const { line } = file.getLineAndCharacterOfPosition(statement.getStart(file));
      const uses = names.map((name) => `\`${statement.name.text}.${name}\``).join(', ');

      return [
        {
          line: line + 1,
          note: `\`import ${statement.name.text} = require('${specifier}')\` is not rewritten: change ${uses} to the new names by hand`,
        },
      ];
    });
  }

  /** The guards first: the type pass reads their output, so both land in one write. */
  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): ICodemodRewrite {
    const { typescript, fileName, source } = opts;
    const guards = NamespaceFunctions.rewrite({
      typescript,
      fileName,
      source,
      mappings: GUARD_MAPPINGS,
    });
    const types = ClassRenames.rewrite({
      typescript,
      fileName,
      source: guards.output,
      rows: PublicNamesTable.TYPE_ROWS,
    });

    return {
      output: types.output,
      changed: types.output !== source,
      rewritten: guards.rewritten + types.rewritten,
      manual: [
        ...PublicNames.findRequireImports(opts),
        ...guards.reports.map((report) => ({ line: report.line, note: report.reason })),
        ...types.manual,
      ],
    };
  }
}

const CODEMOD: IFileCodemod = {
  name: 'public-names',
  usage: USAGE,
  isReversible: false,
  marks: () => [
    ...PublicNamesTable.TYPE_ROWS.map((row) => row.oldName),
    ...GUARD_MAPPINGS.map((mapping) => mapping.oldName),
  ],
  rewrite: (input) => PublicNames.rewrite(input),
};

/** `devz codemod public-names [paths...]`: the type and type guard renames, with the file handling of `class-renames`. */
export class PublicNamesCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    return ClassRenamesCommand.run({ ...opts, codemod: CODEMOD });
  }
}
