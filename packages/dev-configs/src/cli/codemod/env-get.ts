import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod env-get [paths...] [--write [--all] | --check]

Rewrites the type arguments of applicationEnvironment.get() (and its alias AppEnvs.get()) for the
@venizia/ignis-helpers release where get() reads strings:

  get<string>(key)                      becomes  get(key)
  get<string | undefined>(key)          becomes  get(key)
  get<string>(key, { defaultValue })    becomes  get(key, { defaultValue })
  get<R, B>(key, { transform })         becomes  get<R>(key, { transform })

Any other type argument (get<number>(key), get<boolean>(key)) was a cast the new get() no longer allows:
the codemod lists it as "manual" and leaves it. Move the conversion into a transform, or read the
string and convert it where you use it: get(key, { transform: Number }).

A call already in the new form (one type argument and an options literal with a transform) is left alone
and not listed, and a second run changes nothing.

It reads TypeScript files (.ts, .tsx, .mts, .cts) and rewrites only calls whose receiver resolves, from the
scope of the call, to the store: a name imported as applicationEnvironment or AppEnvs from @venizia/ignis,
@venizia/ignis-helpers (or a sub-path), under any local name (import { AppEnvs as Envs } ...), or a const
initialised from such a name in the same or an enclosing scope. A parameter, a local variable, an import from
anywhere else (a barrel of your own included) and a name nothing declares are not the store. Every other
get<...>(key) call (a property, an optional chain, those names) is printed as skipped with its file and line,
and a call with a type argument it cannot place as manual: nothing is left out without a line, so run your
typecheck after it. A comment between the method name and the parenthesis is dropped. A .js, .cjs or .mjs file
is not read: edit it by hand.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files
git knows, and --write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The names the environment store is exported under, and so the receivers `get()` is called on. */
const RECEIVERS = new Set(['applicationEnvironment', 'AppEnvs']);

/** A module that exports the store: the root package and the helpers package, with or without a subpath. */
const STORE_MODULE = /^@venizia\/ignis(?:-helpers)?(?:\/.*)?$/;

class EnvGetFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export interface IEnvGetResult {
  output: string;
  changed: boolean;
  /** How many calls were rewritten. */
  rewritten: number;
  /** The store calls with a type argument the codemod cannot rewrite: file line (1-based) and the first type argument. */
  manual: Array<{ line: number; type: string }>;
  /** The `get<...>(key)` calls on a receiver the file does not bind to the store (or through an optional chain), left alone and listed: file line (1-based) and the receiver text. */
  skipped: Array<{ line: number; receiver: string }>;
}

/** Rewrites the type arguments of `applicationEnvironment.get()` calls. */
export class EnvGet {
  /** The names a declaration in `node` binds, for `node` a scope: a block or file, a function, a loop or a catch clause. */
  private static declarationIn(opts: {
    typescript: typeof import('typescript');
    scope: import('typescript').Node;
    name: string;
  }): import('typescript').Node | undefined {
    const { typescript: ts, scope, name } = opts;

    const bindingNames = (node: import('typescript').BindingName): string[] => {
      if (ts.isIdentifier(node)) {
        return [node.text];
      }

      return node.elements.flatMap((element) =>
        ts.isBindingElement(element) ? bindingNames(element.name) : [],
      );
    };

    const inDeclarations = (
      declarations: ReadonlyArray<import('typescript').VariableDeclaration>,
    ): import('typescript').Node | undefined =>
      declarations.find((declaration) => bindingNames(declaration.name).includes(name));

    if (
      ts.isSourceFile(scope) ||
      ts.isBlock(scope) ||
      ts.isModuleBlock(scope) ||
      ts.isCaseClause(scope) ||
      ts.isDefaultClause(scope)
    ) {
      for (const statement of scope.statements) {
        if (ts.isVariableStatement(statement)) {
          const found = inDeclarations(statement.declarationList.declarations);

          if (found !== undefined) {
            return found;
          }
        } else if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isEnumDeclaration(statement)) &&
          statement.name?.text === name
        ) {
          return statement;
        } else if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
          const clause = statement.importClause;

          if (clause.name?.text === name) {
            return clause;
          }

          const bindings = clause.namedBindings;

          if (
            bindings !== undefined &&
            ts.isNamespaceImport(bindings) &&
            bindings.name.text === name
          ) {
            return bindings;
          }

          if (bindings !== undefined && ts.isNamedImports(bindings)) {
            const element = bindings.elements.find((candidate) => candidate.name.text === name);

            if (element !== undefined) {
              return element;
            }
          }
        }
      }

      return undefined;
    }

    if (ts.isFunctionLike(scope)) {
      const parameter = scope.parameters.find((candidate) =>
        bindingNames(candidate.name).includes(name),
      );

      if (parameter !== undefined) {
        return parameter;
      }

      return ts.isFunctionExpression(scope) && scope.name?.text === name ? scope : undefined;
    }

    if (
      (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer !== undefined &&
      ts.isVariableDeclarationList(scope.initializer)
    ) {
      return inDeclarations(scope.initializer.declarations);
    }

    if (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined) {
      return inDeclarations([scope.variableDeclaration]);
    }

    return undefined;
  }

  /**
   * Whether `identifier` refers to the environment store: the binding the name resolves to, from the
   * innermost scope outwards, is an import of `applicationEnvironment` or `AppEnvs` from the store module
   * (aliased or not), or a `const` that is initialised from such a name. A parameter, a local, an import
   * from anywhere else and a name nothing declares are not the store.
   */
  static isStore(opts: {
    typescript: typeof import('typescript');
    identifier: import('typescript').Identifier;
    seen?: Set<import('typescript').Node>;
  }): boolean {
    const { typescript: ts, identifier } = opts;
    const seen = opts.seen ?? new Set<import('typescript').Node>();

    if (seen.has(identifier)) {
      return false;
    }

    seen.add(identifier);

    for (
      let scope: import('typescript').Node | undefined = identifier.parent;
      scope !== undefined;
      scope = scope.parent
    ) {
      const declaration = EnvGet.declarationIn({ typescript: ts, scope, name: identifier.text });

      if (declaration === undefined) {
        continue;
      }

      if (ts.isImportSpecifier(declaration)) {
        const importDeclaration = declaration.parent.parent.parent;

        return (
          ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
          STORE_MODULE.test(importDeclaration.moduleSpecifier.text) &&
          RECEIVERS.has((declaration.propertyName ?? declaration.name).text)
        );
      }

      if (
        ts.isVariableDeclaration(declaration) &&
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isIdentifier(declaration.initializer)
      ) {
        return EnvGet.isStore({ typescript: ts, identifier: declaration.initializer, seen });
      }

      return false;
    }

    return false;
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): IEnvGetResult {
    const { typescript: ts, fileName, source } = opts;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const manual: Array<{ line: number; type: string }> = [];
    const skipped: Array<{ line: number; receiver: string }> = [];
    const lineOf = (node: import('typescript').Node): number =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    /** `string`, or `string | undefined` (the type `get(key)` already answers): the type argument can go. */
    const isStringType = (node: import('typescript').TypeNode): boolean => {
      if (node.kind === ts.SyntaxKind.StringKeyword) {
        return true;
      }

      if (ts.isParenthesizedTypeNode(node)) {
        return isStringType(node.type);
      }

      if (ts.isUnionTypeNode(node) && node.types.length === 2) {
        const parts = node.types.map((part) => part.kind);

        return (
          parts.includes(ts.SyntaxKind.StringKeyword) &&
          parts.includes(ts.SyntaxKind.UndefinedKeyword)
        );
      }

      return false;
    };

    /** An options literal that already carries a `transform`: the call is in the new form. */
    const hasTransform = (node: import('typescript').Expression | undefined): boolean =>
      node !== undefined &&
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (property) =>
          property.name !== undefined &&
          ts.isIdentifier(property.name) &&
          property.name.text === 'transform',
      );

    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.typeArguments !== undefined &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get'
      ) {
        const callee = node.expression;
        const isOptional =
          node.questionDotToken !== undefined || callee.questionDotToken !== undefined;

        if (
          !isOptional &&
          ts.isIdentifier(callee.expression) &&
          EnvGet.isStore({ typescript: ts, identifier: callee.expression })
        ) {
          const [first, second] = node.typeArguments;
          const start = callee.name.getEnd();
          const end = node.arguments.pos - 1;

          if (node.typeArguments.length === 2 && node.arguments.length > 1) {
            // `get<R, B>(key, options)` keeps R, even when R is `string`: a second run leaves `get<string>(key, { transform })` alone.
            edits.push({ start, end, text: `<${first.getText(file)}>` });
          } else if (node.typeArguments.length === 1 && hasTransform(node.arguments[1])) {
            // One type argument and a transform: the new form, nothing to do and nothing to list.
          } else if (
            isStringType(first) &&
            second === undefined &&
            !(node.arguments.length > 1 && !ts.isObjectLiteralExpression(node.arguments[1]))
          ) {
            edits.push({ start, end, text: '' });
          } else {
            manual.push({ line: lineOf(node), type: first.getText(file) });
          }
        } else if (node.arguments.length > 0 && !ts.isObjectLiteralExpression(node.arguments[0])) {
          // Every other `x.get<T>(key)` is listed, never hidden: a name the file does not bind to the store, a
          // property, a parameter or an optional chain. A container lookup shares the shape (its first
          // argument is an object literal, so it is not listed).
          skipped.push({ line: lineOf(node), receiver: callee.expression.getText(file) });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0, manual, skipped };
    }

    let output = source;

    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten: edits.length, manual, skipped };
  }
}

/** `devz codemod env-get [paths...] [--write | --check]`: rewrites the type arguments of `applicationEnvironment.get()`. */
export class EnvGetCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(EnvGetFlags.HELP) || args.includes(EnvGetFlags.HELP_SHORT)) {
      console.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !EnvGetFlags.isValid(flag));

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(EnvGetFlags.WRITE);
    const isCheck = flags.includes(EnvGetFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${EnvGetFlags.WRITE} and ${EnvGetFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'env-get',
      isWrite,
      isAll: flags.includes(EnvGetFlags.ALL),
      paths,
    });

    if (refusal) {
      console.error(`${refusal}\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    let typescript: typeof import('typescript');

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let callCount = 0;
    let manualCount = 0;
    let skippedCount = 0;
    const manualByType = new Map<string, number>();
    let refusedCount = 0;

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!/\.\s*get\b/.test(source)) {
          continue;
        }

        const result = EnvGet.rewrite({ typescript, fileName: file, source });
        const shown = relative(root, file).split('\\').join('/') || file;

        for (const item of result.manual) {
          manualCount += 1;
          manualByType.set(item.type, (manualByType.get(item.type) ?? 0) + 1);
          console.warn(
            `manual  ${shown}:${item.line}  get<${item.type}>: a type argument the rewrite cannot place (not string or string | undefined, or two without an options argument, or options that are not a literal): a number or other conversion goes in a transform, for example get(key, { transform: Number })`,
          );
        }

        for (const call of result.skipped) {
          skippedCount += 1;
          console.warn(
            `skipped  ${shown}:${call.line}  ${call.receiver}.get<...>(): the receiver is not bound to applicationEnvironment or AppEnvs in this file (a property, a parameter, an optional chain or another object): check it by hand if it is the environment store`,
          );
        }

        if (!result.changed) {
          continue;
        }

        if (dirty?.has(file)) {
          refusedCount += 1;
          console.warn(
            `refused  ${shown}  has local changes (commit or stash them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        callCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} call(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod env-get: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${callCount} call(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${manualCount} manual, ${skippedCount} skipped` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (manualByType.size > 0) {
      const counts = [...manualByType.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([typeText, count]) => `${typeText} x${count}`)
        .join(', ');

      console.log(`manual by type argument: ${counts}`);
    }

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${EnvGetFlags.WRITE} to apply, then run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || manualCount > 0) ? 1 : 0;
  }
}
