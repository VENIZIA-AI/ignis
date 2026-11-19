import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod binding-keys [paths...] [--write [--all] | --check] [--import-from <module>]

Rewrites the raw binding keys of the @venizia/ignis-inversion release where a key is made by BindingKeys.build<T>:

  container.get<Mailer>({ key: 'services.Mailer' })   becomes  container.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) })
  container.bind({ key: 'services.Mailer' })          becomes  container.bind({ key: BindingKeys.build<unknown>({ key: 'services.Mailer' }) })
  @inject({ key: 'services.Mailer' })                 becomes  @inject({ key: BindingKeys.build<unknown>({ key: 'services.Mailer' }) })
  container.get({ key: { namespace, key } })          becomes  container.get({ key: BindingKeys.build<unknown>({ namespace, key }) })
  container.get({ key: \`\${namespace}.Name\` })         becomes  container.get({ key: BindingKeys.build<unknown>({ namespace, key: 'Name' }) })
  BindingKeys.build({ key })                          becomes  BindingKeys.build<unknown>({ key })

The key string is never changed.

A call is rewritten only when the TypeScript checker resolves it to the framework's container (Container, IContainer,
Binding) or to its inject and provide, under any local name. A redis.get<T>({ key }), a worker pool or a class of your own
is left alone, type argument included. The checker reads your project through the nearest tsconfig.json, so run the codemod
from the project root with the dependencies installed; a receiver it cannot resolve is listed as "manual". The call's own type argument moves into build<T>, so the caller keeps the type it
claimed; without one the codemod writes build<unknown> and lists the site ("type"): name the real type there.

It rewrites a call named get, gets, getBinding, bind, isBound or unbind whose argument is an object literal with a
\`key\` (and, for get, \`isOptional\`), and a call of inject or provide. A container cannot be told from syntax, so the shape is the
test. A string key, a substitution-free template literal, a { namespace, key } literal and a template written
\${namespace}.Name or \${namespace}.\${name} are rewritten. These are listed
as "manual" and left alone: a key made at run time (a template with substitutions, a call) and a Symbol key (symbols are no
longer keys). A key that is a const of the file (const MAILER = 'services.Mailer') is rewritten where it is declared. Any
other name or property (Keys.MAILER) is left alone without a line: it may already be a built key, and your typecheck
names a raw one.

BindingKeys is imported from the module the file already takes inject from, else from the first @venizia/ignis import,
or from --import-from <module>; a file with none of them is listed as manual and not rewritten. An existing import of
BindingKeys is reused. A second run changes nothing.

It reads TypeScript files (.ts, .tsx, .mts, .cts). A .js, .cjs or .mjs file is not read: edit it by hand.

  --write        write the changed files (without it, nothing is written); it needs a path, or --all
  --all          with --write and no path: rewrite every source file under the working directory
  --check        dry run that exits 1 while a file would change or a manual site remains (for CI)
  --import-from  the module BindingKeys is imported from when the file gives no better one
  --help         print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files git knows, and
--write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The methods whose options object carries a container key. */
const KEY_METHODS = new Set(['get', 'gets', 'getBinding', 'bind', 'isBound', 'unbind']);

/** The other properties a key options object may carry and still be one. */
const OPTION_NAMES = new Set(['key', 'isOptional', 'scope']);

/** The decorators that take a key options object. */
const KEY_DECORATORS = new Set(['inject', 'provide']);

/** Where a file already imports the container API from. */
const IGNIS_MODULE = /^@venizia\/ignis(?:-kernel|-inversion)?$/;

const BUILDER = 'BindingKeys';

/** The classes and interfaces whose key methods are the container's. */
const CONTAINER_TYPES = new Set([
  'IContainer',
  'AbstractContainer',
  'BaseContainer',
  'Container',
  'Binding',
]);

/** The packages that declare the container: the framework is identified by name, wherever it is installed or checked out. */
const FRAMEWORK_PACKAGES = new Set([
  '@venizia/ignis',
  '@venizia/ignis-inversion',
  '@venizia/ignis-kernel',
]);

/** A module of the framework: a file's own barrel is not a place to take `BindingKeys` from. */
const VENIZIA_MODULE = /^@venizia\//;

class BindingKeysFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly IMPORT_FROM = '--import-from';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.IMPORT_FROM,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** One site the codemod would change or cannot change. */
export interface IBindingKeysResult {
  output: string;
  changed: boolean;
  rewritten: number;
  /** Lines where `build<unknown>` was written because the call named no type. */
  unnamed: number[];
  manual: Array<{ line: number; reason: string }>;
}

/** Rewrites raw binding keys to `BindingKeys.build<T>({ key })`. */
export class BindingKeysCodemod {
  /** The module `BindingKeys` comes from in this file: an existing import, the module of `inject`, a @venizia/ignis import, or `fallback`. */
  private static readIdentifierSource(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
    fallback?: string;
  }): { module: string | undefined; declared: boolean; named?: import('typescript').NamedImports } {
    const { typescript: ts, file, fallback } = opts;
    let injectModule: string | undefined;
    let ignisModule: string | undefined;
    let named: import('typescript').NamedImports | undefined;
    let declared = false;

    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const module = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      const isTypeOnly = statement.importClause?.isTypeOnly === true;

      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;

        if (imported === BUILDER && !isTypeOnly && !element.isTypeOnly) {
          declared = true;
        }

        if (imported === 'inject' && injectModule === undefined && VENIZIA_MODULE.test(module)) {
          injectModule = module;
        }
      }

      if (IGNIS_MODULE.test(module) && !isTypeOnly) {
        ignisModule ??= module;
        named ??= bindings;
      }
    }

    return { module: injectModule ?? ignisModule ?? fallback, declared, named };
  }

  /** The local name `BindingKeys` is imported under (an alias included), or `BindingKeys` when the file does not import it. */
  private static readBuilderName(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
  }): string {
    const { typescript: ts, file } = opts;

    for (const statement of file.statements) {
      const bindings = ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;

      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === BUILDER) {
          return element.name.text;
        }
      }
    }

    return BUILDER;
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
    /** The module `BindingKeys` is imported from when the file gives no better one. */
    importFrom?: string;
    /** The program's source file for `fileName` and its checker: a call is rewritten only when the checker resolves it to the container. */
    program?: {
      sourceFile: import('typescript').SourceFile;
      checker: import('typescript').TypeChecker;
    };
    /** Reads a file for the package.json lookup; defaults to the file system. */
    readFile?: (path: string) => string | undefined;
  }): IBindingKeysResult {
    const {
      typescript: ts,
      fileName,
      importFrom,
      program,
      readFile = (path: string) => ts.sys.readFile(path),
    } = opts;
    const language = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file =
      program?.sourceFile ??
      ts.createSourceFile(fileName, opts.source, ts.ScriptTarget.Latest, true, language);
    const source = file.text;
    const checker = program?.checker;
    const builder = BindingKeysCodemod.readBuilderName({ typescript: ts, file });
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const manual: Array<{ line: number; reason: string }> = [];
    const unnamed: number[] = [];
    const handled = new Set<import('typescript').Node>();
    /** `const NAME = 'literal'` declared once in the file: a key held in a constant is rewritten where it is declared. */
    const constants = new Map<string, import('typescript').VariableDeclaration>();
    const duplicates = new Set<string>();
    let rewritten = 0;
    const lineOf = (node: import('typescript').Node): number =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    const propertyOf = (
      node: import('typescript').ObjectLiteralExpression,
      name: string,
    ): import('typescript').PropertyAssignment | undefined => {
      for (const property of node.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
          property.name.text === name
        ) {
          return property;
        }
      }

      return undefined;
    };

    /** An object literal whose properties are all in `names` and that has a `key`: the shape of a key options object. */
    const isKeyOptions = (
      node: import('typescript').Expression | undefined,
    ): node is import('typescript').ObjectLiteralExpression => {
      if (node === undefined || !ts.isObjectLiteralExpression(node)) {
        return false;
      }

      return (
        propertyOf(node, 'key') !== undefined &&
        node.properties.every(
          (property) =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
            OPTION_NAMES.has(property.name.text),
        )
      );
    };

    const isBuilderCall = (
      node: import('typescript').Node,
    ): node is import('typescript').CallExpression =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === builder &&
      node.expression.name.text === 'build';

    const isSymbolExpression = (node: import('typescript').Expression): boolean =>
      (ts.isCallExpression(node) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === 'Symbol') ||
          (ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === 'Symbol'))) ||
      (ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Symbol');

    /**
     * The `{ namespace, key }` text of a template written as `${namespace}.Name` or `${namespace}.${name}` (the two
     * shapes the framework's own keys take), or `undefined` for any other template.
     */
    const namespaceKeyOf = (node: import('typescript').TemplateExpression): string | undefined => {
      const { head, templateSpans } = node;

      if (head.text !== '') {
        return undefined;
      }

      if (templateSpans.length === 1 && templateSpans[0].literal.text.startsWith('.')) {
        const tail = templateSpans[0].literal.text.slice(1);

        return tail === ''
          ? undefined
          : `{ namespace: ${templateSpans[0].expression.getText(file)}, key: '${tail.replace(/'/g, "\\'")}' }`;
      }

      if (
        templateSpans.length === 2 &&
        templateSpans[0].literal.text === '.' &&
        templateSpans[1].literal.text === ''
      ) {
        return `{ namespace: ${templateSpans[0].expression.getText(file)}, key: ${templateSpans[1].expression.getText(file)} }`;
      }

      return undefined;
    };

    /**
     * Wraps the key of one options object. `typeText` is the value type the call already claimed, or `undefined` for
     * `unknown`. Answers whether the key was rewritten.
     */
    const rewriteKey = (
      options: import('typescript').ObjectLiteralExpression,
      typeText: string | undefined,
    ): boolean => {
      const property = propertyOf(options, 'key');

      if (property === undefined) {
        return false;
      }

      const value = property.initializer;
      const text = typeText ?? 'unknown';

      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${builder}.build<${text}>({ key: ${value.getText(file)} })`,
        });
      } else if (
        ts.isObjectLiteralExpression(value) &&
        propertyOf(value, 'key') !== undefined &&
        value.properties.every(
          (item) =>
            ts.isPropertyAssignment(item) &&
            ts.isIdentifier(item.name) &&
            (item.name.text === 'key' || item.name.text === 'namespace'),
        )
      ) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${builder}.build<${text}>(${value.getText(file)})`,
        });
      } else if (ts.isTemplateExpression(value) && namespaceKeyOf(value) !== undefined) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${builder}.build<${text}>(${namespaceKeyOf(value)})`,
        });
      } else if (
        ts.isIdentifier(value) &&
        constants.has(value.text) &&
        !duplicates.has(value.text)
      ) {
        const declaration = constants.get(value.text);

        if (declaration?.initializer === undefined || handled.has(declaration)) {
          return false;
        }

        handled.add(declaration);
        edits.push({
          start: declaration.initializer.getStart(file),
          end: declaration.initializer.getEnd(),
          text: `${builder}.build<${text}>({ key: ${declaration.initializer.getText(file)} })`,
        });

        if (typeText === undefined) {
          unnamed.push(lineOf(declaration));
        }

        rewritten += 1;

        return true;
      } else if (isBuilderCall(value)) {
        if (value.typeArguments !== undefined) {
          return false;
        }

        handled.add(value);
        // `BindingKeys.build(` then the argument: the type argument goes between the name and the parenthesis.
        edits.push({
          start: value.expression.getEnd(),
          end: value.expression.getEnd(),
          text: `<${text}>`,
        });
      } else if (isSymbolExpression(value)) {
        manual.push({
          line: lineOf(value),
          reason:
            'a Symbol key: symbols are no longer binding keys, use BindingKeys.build<T>({ key: "..." })',
        });

        return false;
      } else {
        // A name or a property (`MAILER`, `Keys.MAILER`) may already be a built key, and the typecheck names a raw
        // one: only an expression that makes a string at run time is listed.
        const isReference =
          ts.isIdentifier(value) ||
          ts.isPropertyAccessExpression(value) ||
          ts.isElementAccessExpression(value);

        if (isReference && checker !== undefined) {
          const type = checker.getTypeAtLocation(value);

          if (type.flags & ts.TypeFlags.StringLike && type.getProperty('valueType') === undefined) {
            manual.push({
              line: lineOf(value),
              reason:
                'a string held in a name: build it with BindingKeys.build<T>({ key }) where it is defined (a key of a package you do not own is built by that package)',
            });
          }
        }

        if (!isReference) {
          manual.push({
            line: lineOf(value),
            reason:
              'a key made at run time (a template with substitutions, a call): build it with BindingKeys.build<T>({ key }) where it is made',
          });
        }

        return false;
      }

      rewritten += 1;

      if (typeText === undefined) {
        unnamed.push(lineOf(value));
      }

      return true;
    };

    /** The declaration the checker resolves a call to, or `undefined` when it cannot (an unresolved receiver). */
    const declarationOf = (
      node: import('typescript').CallExpression,
    ): import('typescript').Declaration | undefined =>
      checker?.getResolvedSignature(node)?.declaration;

    const packageNames = new Map<string, string | undefined>();

    /** The name in the nearest package.json above `directory`, or `undefined` when there is none. */
    const packageNameAbove = (directory: string): string | undefined => {
      if (packageNames.has(directory)) {
        return packageNames.get(directory);
      }

      const text = readFile(join(directory, 'package.json'));
      const parent = dirname(directory);
      let name: string | undefined;

      if (text !== undefined) {
        const parsed: unknown = JSON.parse(text);

        name =
          typeof parsed === 'object' &&
          parsed !== null &&
          'name' in parsed &&
          typeof parsed.name === 'string'
            ? parsed.name
            : '';
      } else if (parent !== directory) {
        name = packageNameAbove(parent);
      }

      packageNames.set(directory, name);

      return name;
    };

    /** A declaration of the framework: the nearest package.json above its file names one of the framework's packages. */
    const isFrameworkFile = (declaration: import('typescript').Node): boolean => {
      const name = packageNameAbove(dirname(declaration.getSourceFile().fileName));

      return name !== undefined && FRAMEWORK_PACKAGES.has(name);
    };

    /** `container.get(...)`: the checker resolves the method to the container's (or `Binding`'s), declared by the framework. */
    const isContainerMethod = (
      declaration: import('typescript').Declaration | undefined,
    ): boolean => {
      if (declaration === undefined || !isFrameworkFile(declaration)) {
        return false;
      }

      const owner = declaration.parent;

      return (
        (ts.isClassLike(owner) || ts.isInterfaceDeclaration(owner)) &&
        owner.name !== undefined &&
        CONTAINER_TYPES.has(owner.name.text)
      );
    };

    /** `inject(...)` or `provide(...)` under any local name: the checker follows the import to the framework's. */
    const isFrameworkDecorator = (callee: import('typescript').Expression): boolean => {
      if (checker === undefined || !ts.isIdentifier(callee)) {
        return false;
      }

      const symbol = checker.getSymbolAtLocation(callee);
      const target =
        symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      const declaration = target?.declarations?.[0];

      return (
        declaration !== undefined &&
        KEY_DECORATORS.has(target?.name ?? '') &&
        isFrameworkFile(declaration)
      );
    };

    /** Whether a type mentions a type parameter of a function or class that encloses `from`. */
    const mentionsScopedTypeParameter = (
      type: import('typescript').TypeNode,
      from: import('typescript').Node,
    ): boolean => {
      const scoped = new Set<string>();

      for (
        let scope: import('typescript').Node | undefined = from;
        scope !== undefined;
        scope = scope.parent
      ) {
        const parameters =
          ts.isFunctionLike(scope) || ts.isClassLike(scope) ? scope.typeParameters : undefined;

        for (const parameter of parameters ?? []) {
          scoped.add(parameter.name.text);
        }
      }

      const search = (node: import('typescript').Node): boolean =>
        (ts.isTypeReferenceNode(node) &&
          ts.isIdentifier(node.typeName) &&
          scoped.has(node.typeName.text)) ||
        ts.forEachChild(node, (child) => (search(child) ? true : undefined)) === true;

      return search(type);
    };

    /** The text of a decorated parameter's type with `undefined` left out: the key names what is injected, not its absence. */
    const liftedTypeText = (type: import('typescript').TypeNode): string => {
      if (!ts.isUnionTypeNode(type)) {
        return type.getText(file);
      }

      const kept = type.types.filter((member) => member.kind !== ts.SyntaxKind.UndefinedKeyword);

      return kept.map((member) => member.getText(file)).join(' | ');
    };

    const visit = (node: import('typescript').Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const first = node.arguments[0];
        const methodName =
          ts.isPropertyAccessExpression(callee) && KEY_METHODS.has(callee.name.text)
            ? callee.name.text
            : undefined;

        if (
          isBuilderCall(node) &&
          node.typeArguments === undefined &&
          node.arguments.length === 1
        ) {
          if (handled.has(node)) {
            ts.forEachChild(node, visit);

            return;
          }

          const argument = node.arguments[0];

          if (ts.isObjectLiteralExpression(argument) && propertyOf(argument, 'key') !== undefined) {
            edits.push({
              start: node.expression.getEnd(),
              end: node.expression.getEnd(),
              text: '<unknown>',
            });
            rewritten += 1;
            unnamed.push(lineOf(node));
          }
        } else if (methodName !== undefined || ts.isIdentifier(callee)) {
          const isGets =
            methodName === 'gets' && first !== undefined && ts.isObjectLiteralExpression(first);
          const hasShape = isGets || isKeyOptions(first);
          const declaration = methodName === undefined ? undefined : declarationOf(node);
          const isContainer =
            methodName === undefined
              ? hasShape && isFrameworkDecorator(callee)
              : hasShape && isContainerMethod(declaration);

          if (hasShape && methodName !== undefined && !isContainer && declaration === undefined) {
            manual.push({
              line: lineOf(node),
              reason: `${methodName}(...) with a key: the receiver's type is not resolved (no tsconfig reaches this file, or it is any), so it is not known to be the container: change it by hand if it is`,
            });
          }

          if (isContainer && isGets && ts.isObjectLiteralExpression(first)) {
            const list = propertyOf(first, 'bindings')?.initializer;

            if (list !== undefined && ts.isArrayLiteralExpression(list)) {
              for (const element of list.elements) {
                if (isKeyOptions(element)) {
                  rewriteKey(element, undefined);
                }
              }
            }
          } else if (isContainer && isKeyOptions(first)) {
            // `@inject({ key }) service: Mailer`: the type the parameter or property already claims is the key's type.
            const decorated =
              methodName === undefined &&
              ts.isDecorator(node.parent) &&
              (ts.isParameter(node.parent.parent) || ts.isPropertyDeclaration(node.parent.parent))
                ? node.parent.parent.type
                : undefined;
            const callArgument =
              methodName !== undefined && node.typeArguments?.length === 1
                ? node.typeArguments[0]
                : undefined;
            const claimed = callArgument ?? decorated;

            // A type that names a type parameter of the enclosing code cannot go into `build<T>`: the check on the type
            // argument is made while it is still unresolved.
            if (claimed !== undefined && mentionsScopedTypeParameter(claimed, node)) {
              manual.push({
                line: lineOf(node),
                reason:
                  'a key whose type names a type parameter of the enclosing code: a generic key factory builds BindingKeys.build<unknown> and returns it typed as TBindingKey<T>',
              });
            } else {
              const isKeyBuilt = (() => {
                const value = propertyOf(first, 'key')?.initializer;

                return (
                  value !== undefined && isBuilderCall(value) && value.typeArguments !== undefined
                );
              })();

              if (!isKeyBuilt) {
                const typeText =
                  callArgument !== undefined
                    ? callArgument.getText(file)
                    : decorated === undefined
                      ? undefined
                      : liftedTypeText(decorated);
                const done = rewriteKey(first, typeText);

                // The type argument moved into `build<T>`; the call no longer needs it. Comments inside it stay.
                if (done && callArgument !== undefined) {
                  const open = node.expression.getEnd();
                  const close = source.indexOf('(', callArgument.getEnd());
                  const comments = source
                    .slice(open, close)
                    .match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*\n?/g);

                  edits.push({ start: open, end: close, text: comments ? comments.join(' ') : '' });
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    const collect = (node: import('typescript').Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
        (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
      ) {
        if (constants.has(node.name.text)) {
          duplicates.add(node.name.text);
        }

        constants.set(node.name.text, node);
      }

      ts.forEachChild(node, collect);
    };

    collect(file);
    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten, unnamed, manual };
    }

    const { module, declared, named } = BindingKeysCodemod.readIdentifierSource({
      typescript: ts,
      file,
      fallback: importFrom,
    });

    if (!declared && module === undefined) {
      return {
        output: source,
        changed: false,
        rewritten: 0,
        unnamed: [],
        manual: [
          ...manual,
          {
            line: 1,
            reason: `${rewritten} key(s) could be rewritten but the file imports nothing from @venizia/ignis to take BindingKeys from: pass --import-from <module>`,
          },
        ],
      };
    }

    if (!declared) {
      if (named !== undefined && named.elements.length > 0) {
        const last = named.elements[named.elements.length - 1];

        edits.push({ start: last.getEnd(), end: last.getEnd(), text: `, ${BUILDER}` });
      } else {
        const lastImport = [...file.statements]
          .reverse()
          .find((statement) => ts.isImportDeclaration(statement));
        const position = lastImport === undefined ? 0 : lastImport.getEnd();
        const text = `${lastImport === undefined ? '' : '\n'}import { ${builder} } from '${module}';${lastImport === undefined ? '\n' : ''}`;

        edits.push({ start: position, end: position, text });
      }
    }

    let output = source;

    for (const edit of [...edits].sort(
      (left, right) => right.start - left.start || right.end - left.end,
    )) {
      output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    }

    return { output, changed: output !== source, rewritten, unnamed, manual };
  }
}

/** `devz codemod binding-keys [paths...] [--write | --check]`: rewrites raw binding keys to `BindingKeys.build<T>`. */
export class BindingKeysCommand {
  static readonly USAGE = USAGE;

  /**
   * The program the checker answers from: the project's own tsconfig (the nearest one above `root`) with the files the
   * codemod reads added, so a receiver resolves the way the project's typecheck resolves it.
   */
  static createProgram(opts: {
    typescript: typeof import('typescript');
    root: string;
    files: string[];
  }): import('typescript').Program {
    const { typescript: ts, root, files } = opts;
    const configPath = ts.findConfigFile(root, (path) => ts.sys.fileExists(path), 'tsconfig.json');
    const read =
      configPath === undefined
        ? undefined
        : ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    const parsed =
      configPath === undefined || read === undefined || read.error !== undefined
        ? undefined
        : ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(configPath, '..'));
    const options: import('typescript').CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      experimentalDecorators: true,
      ...parsed?.options,
      noEmit: true,
      skipLibCheck: true,
      incremental: false,
      composite: false,
      allowJs: false,
    };

    return ts.createProgram({ rootNames: files, options });
  }

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(BindingKeysFlags.HELP) || args.includes(BindingKeysFlags.HELP_SHORT)) {
      console.log(USAGE);

      return 0;
    }

    const flags: string[] = [];
    const paths: string[] = [];
    let importFrom: string | undefined;
    let hasImportFlag = false;

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];

      if (argument === BindingKeysFlags.IMPORT_FROM) {
        hasImportFlag = true;
        importFrom = args[index + 1];
        index += 1;
      } else if (argument.startsWith('-')) {
        flags.push(argument);
      } else {
        paths.push(argument);
      }
    }

    const unknown = flags.filter((flag) => !BindingKeysFlags.isValid(flag));

    if (hasImportFlag && (importFrom === undefined || importFrom.startsWith('-'))) {
      console.error(`devz codemod: ${BindingKeysFlags.IMPORT_FROM} needs a module\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(BindingKeysFlags.WRITE);
    const isCheck = flags.includes(BindingKeysFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${BindingKeysFlags.WRITE} and ${BindingKeysFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'binding-keys',
      isWrite,
      isAll: flags.includes(BindingKeysFlags.ALL),
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
    let rewrittenCount = 0;
    let manualCount = 0;
    let unnamedCount = 0;
    let refusedCount = 0;

    const collected = targets.map((target) => CodemodFiles.collect({ target }));
    const program = BindingKeysCommand.createProgram({
      typescript,
      root,
      files: collected.flat(),
    });
    const checker = program.getTypeChecker();

    for (const [index, target] of targets.entries()) {
      const files = collected[index];
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!/\b(?:get|gets|getBinding|bind|isBound|unbind|inject|provide|build)\b/.test(source)) {
          continue;
        }

        const sourceFile = program.getSourceFile(file);
        const result = BindingKeysCodemod.rewrite({
          typescript,
          fileName: file,
          source,
          importFrom,
          program: sourceFile === undefined ? undefined : { sourceFile, checker },
        });
        const shown = relative(root, file).split('\\').join('/') || file;

        for (const item of result.manual) {
          manualCount += 1;
          console.warn(`manual  ${shown}:${item.line}  ${item.reason}`);
        }

        for (const line of result.unnamed) {
          unnamedCount += 1;
          console.warn(
            `type  ${shown}:${line}  BindingKeys.build<unknown>: name the type of the value bound under this key`,
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
        rewrittenCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} key(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod binding-keys: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${rewrittenCount} key(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${unnamedCount} to type, ${manualCount} manual` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${BindingKeysFlags.WRITE} to apply, then name each "type" site and run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || manualCount > 0) ? 1 : 0;
  }
}
