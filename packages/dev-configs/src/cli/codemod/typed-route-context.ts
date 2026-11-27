import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type TypeScript from 'typescript';
import { CodemodFiles } from './files';
import { CliOutput } from '../../common/cli-output';

const USAGE = `Usage: devz codemod typed-route-context [paths...] [--write [--all] | --check]

Types route handlers from their route config (TContextOf). In a file that imports the types from @venizia/ignis or
@venizia/ignis-kernel:

- a decorated method (@api, @get, @post, @put, @patch, @del) whose configs is a name declared or imported in the
  file: its TRouteContext becomes TContextOf<typeof CONFIG>, and valid<T>() on it loses its type argument;
- the same for a private method that only the handlers of one route config in its class pass their context to;
- TRouteContext<Env, Body> drops the body, and TRouteHandler<Response, Env> drops the response.

Left as they are, for you: a handler of a CRUD override, a method that serves two routes or is also called another
way, an inline or this.* config, and a context typed through an alias of yours. The typecheck then names each place
where a type you wrote by hand differs from the schema.

A config declared as IAuthRouteConfig, or in a Record of it, carries no schema type: change it to
"satisfies" first (the lint rule @venizia/typed-route-context reports each one). A handler of such a config declared
in the same file is left as it is; one imported from another file cannot be seen, so change those first.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files git
knows (tracked, or untracked and not ignored), and --write refuses a file with local changes (changed since staged, or untracked): commit, stash or "git add" it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class TypedRouteContextFlags {
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

const PACKAGES = ['@venizia/ignis', '@venizia/ignis-kernel'];
const DECORATORS = new Set(['api', 'get', 'post', 'put', 'patch', 'del']);
const CONTEXT = 'TRouteContext';
const HANDLER = 'TRouteHandler';
const TYPED = 'TContextOf';

export interface ITypedRouteContextResult {
  output: string;
  changed: boolean;
  /** How many places were rewritten. */
  rewritten: number;
}

/** One file's rewrite: the edits found so far, applied from the end of the file. */
class RouteContextFile {
  private static readonly IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
  private readonly file: TypeScript.SourceFile;
  private readonly edits = new Map<number, { start: number; end: number; text: string }>();
  /** The local names the framework's types were imported under. */
  private readonly locals = new Map<string, string>();
  /** The names a `typeof` at the top of the file can read. */
  private readonly topLevel = new Set<string>();
  /** The configs this file declares as `IAuthRouteConfig`, as a name or `Class.member`: their type holds no schema. */
  private readonly wide = new Set<string>();

  constructor(
    private readonly options: {
      typescript: typeof TypeScript;
      fileName: string;
      source: string;
    },
  ) {
    const { typescript: ts, fileName, source } = options;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    this.file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  }

  rewrite(): ITypedRouteContextResult {
    const { typescript: ts, source } = this.options;
    this.readTopLevel();

    if (this.locals.size === 0) {
      return { output: source, changed: false, rewritten: 0 };
    }

    const visit = (node: TypeScript.Node): void => {
      if (ts.isClassLike(node)) {
        this.typeClass(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(this.file);
    this.dropRemovedArguments(this.file);
    const rewritten = this.edits.size;

    if (rewritten === 0) {
      return { output: source, changed: false, rewritten };
    }

    this.fixImport();
    let output = source;

    for (const edit of [...this.edits.values()].sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten };
  }

  private replace(opts: { start: number; end: number; text: string }) {
    this.edits.set(opts.start, opts);
  }

  private readTopLevel() {
    const { typescript: ts } = this.options;

    for (const statement of this.file.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const name = declaration.name.getText(this.file);
          this.topLevel.add(name);

          if (this.isWideDeclaration(declaration)) {
            this.wide.add(name);
          }

          this.readWideMembers({ owner: name, value: declaration.initializer });
        }
      }

      if (ts.isClassDeclaration(statement) && statement.name) {
        const owner = statement.name.text;
        this.topLevel.add(owner);

        for (const member of statement.members) {
          if (ts.isPropertyDeclaration(member) && this.isWideDeclaration(member)) {
            this.wide.add(`${owner}.${member.name.getText(this.file)}`);
          }
        }
      }

      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const specifier = statement.moduleSpecifier.getText(this.file).slice(1, -1);
      const bindings = statement.importClause?.namedBindings;
      const defaultName = statement.importClause?.name;

      if (defaultName) {
        this.topLevel.add(defaultName.text);
      }

      if (!bindings) {
        continue;
      }

      if (ts.isNamespaceImport(bindings)) {
        this.topLevel.add(bindings.name.text);
        continue;
      }

      const isFramework = PACKAGES.some(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      );

      for (const element of bindings.elements) {
        this.topLevel.add(element.name.text);
        const imported = (element.propertyName ?? element.name).text;

        if (isFramework && (imported === CONTEXT || imported === HANDLER || imported === TYPED)) {
          this.locals.set(element.name.text, imported);
        }
      }
    }
  }

  /** The members of an object literal asserted wide one by one: `{ A: { ... } as IAuthRouteConfig }`. */
  private readWideMembers(opts: { owner: string; value: TypeScript.Expression | undefined }) {
    const { typescript: ts } = this.options;
    let { value } = opts;

    while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value))) {
      value = value.expression;
    }

    if (!value || !ts.isObjectLiteralExpression(value)) {
      return;
    }

    for (const property of value.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        ts.isAsExpression(property.initializer) &&
        this.isWideType(property.initializer.type)
      ) {
        const key = ts.isStringLiteralLike(property.name)
          ? property.name.text
          : property.name.getText(this.file);
        this.wide.add(`${opts.owner}.${key}`);
      }
    }
  }

  /** Whether a declaration is typed `IAuthRouteConfig`, in an `Omit` or a `Record` too, by annotation or by `as`. */
  private isWideDeclaration(
    declaration: TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration,
  ): boolean {
    const { typescript: ts } = this.options;
    const { initializer } = declaration;
    const asserted = initializer && ts.isAsExpression(initializer) ? initializer.type : undefined;

    return this.isWideType(declaration.type) || this.isWideType(asserted);
  }

  private isWideType(type: TypeScript.TypeNode | undefined): boolean {
    const { typescript: ts } = this.options;

    if (!type || !ts.isTypeReferenceNode(type)) {
      return false;
    }

    const name = type.typeName.getText(this.file);
    const [first, second] = type.typeArguments ?? [];

    if (name === 'Record') {
      return this.isWideType(second);
    }

    return name === 'Omit' || name === 'Readonly'
      ? this.isWideType(first)
      : name === 'IAuthRouteConfig';
  }

  /** The framework type a type reference names. */
  private frameworkType(node: TypeScript.Node): string | undefined {
    const { typescript: ts } = this.options;

    return ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)
      ? this.locals.get(node.typeName.text)
      : undefined;
  }

  /**
   * The type of a `configs` expression a `typeof` can read here (`typeof Routes.CREATE`, `(typeof Routes)['/create']`);
   * `undefined` for anything else.
   */
  private configOf(options: TypeScript.Expression | undefined): string | undefined {
    const { typescript: ts } = this.options;

    if (!options || !ts.isObjectLiteralExpression(options)) {
      return undefined;
    }

    const property = options.properties.find((item) => item.name?.getText(this.file) === 'configs');

    if (!property || !ts.isPropertyAssignment(property)) {
      return undefined;
    }

    const keys: string[] = [];
    let current: TypeScript.Expression = property.initializer;

    while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      if (ts.isPropertyAccessExpression(current)) {
        keys.unshift(current.name.text);
      } else if (ts.isStringLiteralLike(current.argumentExpression)) {
        keys.unshift(current.argumentExpression.text);
      } else {
        return undefined;
      }

      current = current.expression;
    }

    if (!ts.isIdentifier(current) || !this.topLevel.has(current.text)) {
      return undefined;
    }

    if (this.wide.has(current.text) || this.wide.has(`${current.text}.${keys[0]}`)) {
      return undefined;
    }

    const firstQuoted = keys.findIndex((key) => !RouteContextFile.IDENTIFIER.test(key));
    const dotted = firstQuoted === -1 ? keys : keys.slice(0, firstQuoted);
    const query = `typeof ${[current.text, ...dotted].join('.')}`;

    if (firstQuoted === -1) {
      return query;
    }

    const indexed = keys
      .slice(firstQuoted)
      .map((key) => `['${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}']`);

    return `(${query})${indexed.join('')}`;
  }

  /** Types the decorated methods of a class, and the methods only one route's handlers pass their context to. */
  private typeClass(node: TypeScript.ClassLikeDeclaration) {
    const { typescript: ts } = this.options;
    const forwarded = this.forwardsOf(node);

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }

      const decorated = (ts.getDecorators(member) ?? []).flatMap((decorator) => {
        const call = decorator.expression;

        return ts.isCallExpression(call) && DECORATORS.has(call.expression.getText(this.file))
          ? [this.configOf(call.arguments[0])]
          : [];
      });
      const isPrivate =
        ts.isPrivateIdentifier(member.name) ||
        member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword) ===
          true;

      // Only a private method is known to be reached from this class alone.
      if (decorated.length === 0 && !isPrivate) {
        continue;
      }

      const routes = [...decorated, ...(forwarded.get(member.name.getText(this.file)) ?? [])];
      const [config] = routes;

      if (config !== undefined && routes.every((route) => route === config)) {
        this.typeMethod({ method: member, config });
      }
    }
  }

  /**
   * The routes whose handlers pass their context straight to each method of the class. A method also reached another
   * way gets an `undefined` route, which keeps it as it is.
   */
  private forwardsOf(node: TypeScript.ClassLikeDeclaration) {
    const { typescript: ts } = this.options;
    const routes = new Map<string, Array<string | undefined>>();
    const passed = new Set<TypeScript.Node>();

    const add = (method: string, route: string | undefined) => {
      routes.set(method, [...(routes.get(method) ?? []), route]);
    };

    const visit = (current: TypeScript.Node): void => {
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
        const forward = this.forwardOf(current);

        if (forward) {
          passed.add(forward.access);
          add(forward.method, forward.config);
        }
      }

      if (
        ts.isPropertyAccessExpression(current) &&
        current.expression.kind === ts.SyntaxKind.ThisKeyword &&
        !passed.has(current)
      ) {
        add(current.name.text, undefined);
      }

      ts.forEachChild(current, visit);
    };

    ts.forEachChild(node, visit);

    return routes;
  }

  /** The method a `defineRoute`, `defineJSXRoute` or `bindRoute().to` call forwards its context to. */
  private forwardOf(call: TypeScript.CallExpression) {
    const { typescript: ts } = this.options;
    const callee = call.expression;

    if (!ts.isPropertyAccessExpression(callee)) {
      return undefined;
    }

    const name = callee.name.text;
    const [options] = call.arguments;
    let routeOptions: TypeScript.Expression | undefined;

    if (name === 'defineRoute' || name === 'defineJSXRoute') {
      routeOptions = options;
    } else if (
      name === 'to' &&
      ts.isCallExpression(callee.expression) &&
      ts.isPropertyAccessExpression(callee.expression.expression) &&
      callee.expression.expression.name.text === 'bindRoute'
    ) {
      routeOptions = callee.expression.arguments[0];
    }

    if (!routeOptions || !options || !ts.isObjectLiteralExpression(options)) {
      return undefined;
    }

    const handler = options.properties.find((item) => item.name?.getText(this.file) === 'handler');

    if (!handler || !ts.isPropertyAssignment(handler) || !ts.isArrowFunction(handler.initializer)) {
      return undefined;
    }

    const [parameter] = handler.initializer.parameters;
    let body: TypeScript.Node | undefined = handler.initializer.body;

    if (ts.isBlock(body)) {
      const [only, ...others] = body.statements;
      body =
        only && others.length === 0 && ts.isReturnStatement(only) ? only.expression : undefined;
    }

    if (body && ts.isAwaitExpression(body)) {
      body = body.expression;
    }

    if (
      !parameter ||
      !body ||
      !ts.isCallExpression(body) ||
      !ts.isPropertyAccessExpression(body.expression) ||
      body.expression.expression.kind !== ts.SyntaxKind.ThisKeyword
    ) {
      return undefined;
    }

    const context = parameter.name.getText(this.file);
    const passes = body.arguments.some((argument) => {
      if (!ts.isObjectLiteralExpression(argument)) {
        return argument.getText(this.file) === context;
      }

      return argument.properties.some(
        (item) =>
          item.name?.getText(this.file) === 'context' &&
          (ts.isShorthandPropertyAssignment(item)
            ? context === 'context'
            : ts.isPropertyAssignment(item) && item.initializer.getText(this.file) === context),
      );
    });

    return passes
      ? {
          access: body.expression,
          method: body.expression.name.text,
          config: this.configOf(routeOptions),
        }
      : undefined;
  }

  /** Writes `TContextOf<typeof config>` on the method's context, and drops the type arguments of its `valid()`. */
  private typeMethod(opts: { method: TypeScript.MethodDeclaration; config: string }) {
    const { typescript: ts } = this.options;
    const { method, config } = opts;
    /** The paths that hold the retyped context, as written: `context`, `opts.context`. */
    const holders = new Set<string>();

    for (const parameter of method.parameters) {
      let type = parameter.type;
      let path = parameter.name.getText(this.file);

      if (type && ts.isTypeLiteralNode(type)) {
        const member = type.members.find((item) => item.name?.getText(this.file) === 'context');
        type = member && ts.isPropertySignature(member) ? member.type : undefined;
        path = ts.isIdentifier(parameter.name) ? `${path}.context` : 'context';
      }

      if (!type || !ts.isTypeReferenceNode(type) || this.frameworkType(type) !== CONTEXT) {
        continue;
      }

      const environment = type.typeArguments?.[0]?.getText(this.file);
      const suffix = environment ? `, ${environment}` : '';
      this.replace({
        start: type.getStart(this.file),
        end: type.getEnd(),
        text: `${this.localName(TYPED)}<${config}${suffix}>`,
      });
      holders.add(path);
    }

    if (holders.size === 0 || !method.body) {
      return;
    }

    const visit = (node: TypeScript.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        holders.has(`${node.initializer.getText(this.file)}.context`)
      ) {
        holders.add('context');
      }

      if (
        ts.isCallExpression(node) &&
        node.typeArguments &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'valid' &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === 'req' &&
        holders.has(node.expression.expression.expression.getText(this.file))
      ) {
        this.replace({
          start: node.expression.getEnd(),
          end: node.typeArguments.end + 1,
          text: '',
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(method.body);
  }

  /** Drops the response arguments the framework's types no longer take, outside the contexts already retyped. */
  private dropRemovedArguments(node: TypeScript.Node) {
    const { typescript: ts } = this.options;

    if (
      ts.isTypeReferenceNode(node) &&
      node.typeArguments?.length === 2 &&
      !this.edits.has(node.getStart(this.file))
    ) {
      const type = this.frameworkType(node);
      const [first, second] = node.typeArguments;
      const kept = type === CONTEXT ? first : type === HANDLER ? second : undefined;

      if (kept) {
        this.replace({
          start: node.getStart(this.file),
          end: node.getEnd(),
          text: `${node.typeName.getText(this.file)}<${kept.getText(this.file)}>`,
        });
      }
    }

    ts.forEachChild(node, (child) => this.dropRemovedArguments(child));
  }

  /** The local name of a framework type, or its own name when the file does not import it yet. */
  private localName(type: string): string {
    return [...this.locals].find(([, imported]) => imported === type)?.[0] ?? type;
  }

  /** Imports `TContextOf` beside the type it replaced, and drops `TRouteContext` when nothing reads it any more. */
  private fixImport() {
    const { typescript: ts } = this.options;
    /** Whether an edit takes this node away: one that writes the name back (`TRouteContext<Env>`) does not. */
    const isRemoved = (node: TypeScript.Node, name: string) =>
      [...this.edits.values()].some(
        (edit) =>
          edit.start <= node.getStart(this.file) &&
          edit.end >= node.getEnd() &&
          !edit.text.split(/[^\w$]+/).includes(name),
      );
    const usesTyped = [...this.edits.values()].some((edit) =>
      edit.text.startsWith(`${this.localName(TYPED)}<`),
    );

    if (!usesTyped) {
      return;
    }

    const contextName = this.localName(CONTEXT);
    let isStillRead = false;

    const visit = (node: TypeScript.Node): void => {
      if (ts.isImportDeclaration(node)) {
        return;
      }

      if (
        ts.isIdentifier(node) &&
        node.text === contextName &&
        !isRemoved(node.parent, contextName)
      ) {
        isStillRead = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(this.file);
    const needsImport = ![...this.locals.values()].includes(TYPED);

    for (const statement of this.file.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;

      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }

      const old = bindings.elements.find((element) => element.name.text === contextName);

      if (!old) {
        continue;
      }

      const isTypeOnly = statement.importClause?.isTypeOnly === true;
      const added = isTypeOnly ? TYPED : `type ${TYPED}`;
      const names = [
        ...(isStillRead ? [old.getText(this.file)] : []),
        ...(needsImport ? [added] : []),
      ];

      if (names.length > 0) {
        this.replace({
          start: old.getStart(this.file),
          end: old.getEnd(),
          text: names.join(', '),
        });

        return;
      }

      const others = bindings.elements.filter((element) => element !== old);
      this.replace({
        start: bindings.getStart(this.file),
        end: bindings.getEnd(),
        text: `{ ${others.map((element) => element.getText(this.file)).join(', ')} }`,
      });

      return;
    }
  }
}

/** Types route handlers from their route configs. */
export class TypedRouteContext {
  static rewrite(opts: {
    typescript: typeof TypeScript;
    fileName: string;
    source: string;
  }): ITypedRouteContextResult {
    return new RouteContextFile(opts).rewrite();
  }
}

/**
 * `devz codemod typed-route-context [paths...] [--write [--all] | --check]`. It is a dry run unless `--write` is
 * given. `--check` is the same dry run, and exits 1 while a file would change.
 */
export class TypedRouteContextCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (
      args.includes(TypedRouteContextFlags.HELP) ||
      args.includes(TypedRouteContextFlags.HELP_SHORT)
    ) {
      CliOutput.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !TypedRouteContextFlags.isValid(flag));

    if (unknown.length > 0) {
      CliOutput.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(TypedRouteContextFlags.WRITE);
    const isCheck = flags.includes(TypedRouteContextFlags.CHECK);

    if (isWrite && isCheck) {
      CliOutput.error(
        `devz codemod: ${TypedRouteContextFlags.WRITE} and ${TypedRouteContextFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'typed-route-context',
      isWrite,
      isAll: flags.includes(TypedRouteContextFlags.ALL),
      paths,
    });

    if (refusal) {
      CliOutput.error(`${refusal}\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    let typescript: typeof TypeScript;

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      CliOutput.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let rewrittenCount = 0;
    let refusedCount = 0;

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        CliOutput.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!source.includes(CONTEXT) && !source.includes(HANDLER)) {
          continue;
        }

        const result = TypedRouteContext.rewrite({ typescript, fileName: file, source });

        if (!result.changed) {
          continue;
        }

        const shown = relative(root, file).split('\\').join('/') || file;

        if (dirty?.has(file)) {
          refusedCount += 1;
          CliOutput.warn(
            `refused  ${shown}  has local changes (commit, stash or "git add" them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        rewrittenCount += result.rewritten;
        CliOutput.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} place(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    CliOutput.log(
      `devz codemod typed-route-context: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${rewrittenCount} place(s) ${isWrite ? 'rewritten' : 'would be rewritten'}` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      CliOutput.log(
        `Nothing was written. Run again with ${TypedRouteContextFlags.WRITE} to apply, then run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && changedCount > 0 ? 1 : 0;
  }
}
