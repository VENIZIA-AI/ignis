import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ClassRenamesCommand, type ICodemodRewrite } from './class-renames';
import { CliOutput } from '../../common/cli-output';

const USAGE = `Usage: devz codemod execution-scope --map <file.json> [paths...] [--write [--all] | --check] [--rewrite-nested]

An application's own scope helpers become Execution.run (@venizia/ignis). The map names them:

  {
    "runElevated": { "mode": "system" },
    "runPinned": { "mode": "scoped", "values": { "tenantIds": "tenantIds" } }
  }

A key is the exported name of a helper, or "Class.method". "values" names the value of the frame (left) and the
option of the helper that holds it (right). It reads a call of an imported helper, an aliased import included, in
one of these shapes, where the task is an arrow or a function with no parameter, written in the call:

  helper(task)                       a helper with no "values"
  helper({ tenantIds, task })        the options of "values" and one other property, the task
  helper({ tenantIds }, task)        the options of "values", then the task

A system call gets the reason "TODO: reason (<file>:<method>)" for you to write. It lists by file and line what it
leaves for you: those reasons, every call it cannot read (a helper passed as a value, a spread argument, a task by
reference), and every system call lexically inside a scoped one, which would see more under "the innermost frame
wins". It does not follow calls across functions. A file that defines a mapped helper is not touched. Event
handlers and queue consumers are listed as "review": they no longer inherit system rights.

Execution.run always returns a promise: where a helper was synchronous, your typecheck and tests must confirm the call.

  --map             the JSON file of your helpers (required), relative to the working directory
  --write           write the changed files (without it, nothing is written); it needs a path, or --all
  --all             with --write and no path: rewrite every source file under the working directory
  --check           dry run that exits 1 while a file would change or a line is left for you (for CI)
  --rewrite-nested  rewrite the system calls inside scoped ones too, after you reviewed them
  --help            print this text and exit

There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

const MAP_FLAG = '--map';
const NESTED_FLAG = '--rewrite-nested';
const TODO_PREFIX = 'TODO: reason (';
const IGNIS_MODULE = '@venizia/ignis';
const IGNIS_PACKAGES = [IGNIS_MODULE, '@venizia/ignis-helpers'];
const EXECUTION = 'Execution';
const EXECUTION_MODES = 'ExecutionModes';
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const KEY_PATTERN = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/;

/** The callbacks of a queue consumer: BullMQ, Kafka, MQTT and the in-memory queue. */
const CONSUMER_CALLBACKS: ReadonlySet<string> = new Set([
  'onWorkerData',
  'onWorkerDataCompleted',
  'onWorkerDataFail',
  'onMessage',
  'onMessageDone',
  'onMessageError',
]);

/** What a helper of the map is. */
export type TExecutionScopeEntry =
  | { mode: 'system' }
  | { mode: 'scoped'; values?: Readonly<Record<string, string>> };

/** The helpers of an application, by exported name or "Class.method". */
export type TExecutionScopeMap = Readonly<Record<string, TExecutionScopeEntry>>;

/** What `ExecutionScopeRewrite.rewrite` did to one file; `info` is always there. */
export interface IExecutionScopeRewrite extends ICodemodRewrite {
  info: NonNullable<ICodemodRewrite['info']>;
}

interface ISpan {
  start: number;
  end: number;
}

interface ITextEdit extends ISpan {
  text: string;
}

/** Reads and checks the JSON of `--map`. */
export class ExecutionScopeMapReader {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** The values of a scoped entry, or `undefined` when one is not an option name. */
  private static readValues(value: unknown): Record<string, string> | undefined {
    if (!ExecutionScopeMapReader.isRecord(value)) {
      return undefined;
    }

    const values: Record<string, string> = {};

    for (const [key, option] of Object.entries(value)) {
      if (typeof option !== 'string' || option === '') {
        return undefined;
      }

      values[key] = option;
    }

    return values;
  }

  private static readEntry(value: unknown): TExecutionScopeEntry | undefined {
    if (!ExecutionScopeMapReader.isRecord(value)) {
      return undefined;
    }

    const { mode, values, ...rest } = value;

    if (Object.keys(rest).length > 0) {
      return undefined;
    }

    if (mode === 'system') {
      return values === undefined ? { mode } : undefined;
    }

    if (mode !== 'scoped') {
      return undefined;
    }

    if (values === undefined) {
      return { mode };
    }

    const read = ExecutionScopeMapReader.readValues(values);

    return read ? { mode, values: read } : undefined;
  }

  /** The map in `text`, or why it is not one. */
  static parse(opts: { text: string }): { map: TExecutionScopeMap } | { error: string } {
    let data: unknown;

    try {
      data = JSON.parse(opts.text);
    } catch (error) {
      return { error: `not JSON: ${String(error)}` };
    }

    if (!ExecutionScopeMapReader.isRecord(data) || Object.keys(data).length === 0) {
      return { error: 'an object with one entry per helper is expected' };
    }

    const map: Record<string, TExecutionScopeEntry> = {};

    for (const [name, value] of Object.entries(data)) {
      const entry = ExecutionScopeMapReader.readEntry(value);

      if (!KEY_PATTERN.test(name) || !entry) {
        return {
          error: `"${name}": the key is a name or "Class.method", the value { "mode": "system" } or { "mode": "scoped", "values"?: { "<value>": "<option>" } }`,
        };
      }

      map[name] = entry;
    }

    return { map };
  }
}

/** Rewrites the calls of one file. */
export class ExecutionScopeRewrite {
  /** Whether `node` names a member or a property, and is no use of a binding. */
  private static isMemberName(opts: {
    typescript: typeof import('typescript');
    node: import('typescript').Identifier;
  }): boolean {
    const { typescript: ts, node } = opts;
    const parent = node.parent;

    if (ts.isQualifiedName(parent)) {
      return parent.right === node;
    }

    if (ts.isBindingElement(parent)) {
      return parent.propertyName === node;
    }

    return (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isMethodSignature(parent) ||
        ts.isGetAccessorDeclaration(parent) ||
        ts.isSetAccessorDeclaration(parent) ||
        ts.isEnumMember(parent) ||
        ts.isJsxAttribute(parent)) &&
      parent.name === node
    );
  }

  /** The mapped helpers this file defines itself: its calls are the helper's own, and stay. */
  private static definitions(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
    map: TExecutionScopeMap;
  }): Array<{ node: import('typescript').Node; name: string }> {
    const { typescript: ts, file, map } = opts;
    const found: Array<{ node: import('typescript').Node; name: string }> = [];

    const check = (node: import('typescript').Node, name: string) => {
      if (Object.hasOwn(map, name)) {
        found.push({ node, name });
      }
    };

    for (const statement of file.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        check(statement, statement.name.text);
      }

      if (ts.isClassDeclaration(statement) && statement.name) {
        for (const member of statement.members) {
          check(member, `${statement.name.text}.${member.name?.getText(file)}`);
        }
      }

      if (!ts.isVariableStatement(statement)) {
        continue;
      }

      for (const { name, initializer } of statement.declarationList.declarations) {
        if (!ts.isIdentifier(name)) {
          continue;
        }

        check(statement, name.text);

        if (initializer && ts.isObjectLiteralExpression(initializer)) {
          for (const property of initializer.properties) {
            check(property, `${name.text}.${property.name?.getText(file)}`);
          }
        }
      }
    }

    return found;
  }

  /** The event handlers and queue consumers of the file: they ran with their starter's rights, and no longer do. */
  private static listeners(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
  }): Array<{ node: import('typescript').Node; note: string }> {
    const { typescript: ts, file } = opts;
    const found: Array<{ node: import('typescript').Node; note: string }> = [];
    const lost = 'it no longer inherits system rights';

    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isHeritageClause(node) &&
        node.types.some((type) => type.expression.getText(file) === 'IEventHandler')
      ) {
        found.push({ node, note: `event handler: ${lost}` });
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'register'
      ) {
        const [options] = node.arguments;
        const names =
          options && ts.isObjectLiteralExpression(options)
            ? options.properties.map((property) => property.name?.getText(file))
            : [];

        if (names.includes('name') && names.includes('handler')) {
          found.push({ node, note: `event handler registration: ${lost}` });
        }
      }

      const isMember =
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node);

      if (isMember && CONSUMER_CALLBACKS.has(node.name.getText(file))) {
        found.push({ node, note: `queue consumer (${node.name.getText(file)}): ${lost}` });
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    return found;
  }

  /** The method or function a node stands in; without one, the variable or property it is written under. */
  private static methodOf(opts: {
    typescript: typeof import('typescript');
    node: import('typescript').Node;
    file: import('typescript').SourceFile;
  }): string {
    const { typescript: ts, node, file } = opts;
    let holder: string | undefined;

    for (let at = node.parent; !ts.isSourceFile(at); at = at.parent) {
      if (ts.isConstructorDeclaration(at)) {
        return 'constructor';
      }

      if (
        (ts.isMethodDeclaration(at) ||
          ts.isFunctionDeclaration(at) ||
          ts.isGetAccessorDeclaration(at) ||
          ts.isSetAccessorDeclaration(at)) &&
        at.name
      ) {
        return at.name.getText(file);
      }

      if (
        (ts.isVariableDeclaration(at) ||
          ts.isPropertyDeclaration(at) ||
          ts.isPropertyAssignment(at)) &&
        ts.isIdentifier(at.name)
      ) {
        holder ??= at.name.text;
      }
    }

    return holder ?? 'module';
  }

  /** Whether a comment stands in a part of the call that the rewrite replaces. */
  private static hasComment(opts: {
    typescript: typeof import('typescript');
    source: string;
    span: ISpan;
    kept: ReadonlyArray<ISpan>;
  }): boolean {
    const { typescript: ts, source, span, kept } = opts;
    let text = '';
    let at = span.start;

    for (const part of [...kept].sort((a, b) => a.start - b.start)) {
      text += `${source.slice(at, part.start)} 0 `;
      at = part.end;
    }

    text += source.slice(at, span.end);

    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      text,
    );

    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        return true;
      }
    }

    return false;
  }

  /** The task and the values of a call, or why the call cannot be read. */
  private static readCall(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
    call: import('typescript').CallExpression;
    entry: TExecutionScopeEntry;
  }):
    | {
        task: import('typescript').Expression;
        values: Array<{ key: string; node: import('typescript').Node }>;
      }
    | { reason: string } {
    const { typescript: ts, file, call, entry } = opts;
    const wanted = Object.entries(entry.mode === 'scoped' ? (entry.values ?? {}) : {});
    const args = [...call.arguments];

    if (args.some((argument) => ts.isSpreadElement(argument))) {
      return { reason: 'a spread argument' };
    }

    const [first, second] = args;

    if (!first || args.length > 2) {
      return { reason: `${args.length} arguments` };
    }

    const values: Array<{ key: string; node: import('typescript').Node }> = [];
    const others: import('typescript').ObjectLiteralElementLike[] = [];

    if (ts.isObjectLiteralExpression(first)) {
      const options = new Map<string, import('typescript').Node>();

      for (const property of first.properties) {
        if (ts.isShorthandPropertyAssignment(property) && !property.objectAssignmentInitializer) {
          options.set(property.name.text, property.name);
        } else if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
          options.set(property.name.text, property.initializer);
        } else {
          return { reason: 'an option that is not "name" or "name: value"' };
        }

        if (!wanted.some(([, option]) => option === property.name?.getText(file))) {
          others.push(property);
        }
      }

      for (const [key, option] of wanted) {
        const node = options.get(option);

        if (!node) {
          return { reason: `no "${option}" option` };
        }

        values.push({ key, node });
      }
    } else if (second || wanted.length > 0) {
      return { reason: 'its options are not an object written in the call' };
    }

    let task: import('typescript').Expression | undefined = second;

    if (second && others.length > 0) {
      return { reason: 'an option the map does not name' };
    }

    if (!second && ts.isObjectLiteralExpression(first)) {
      const [property] = others;
      task =
        others.length === 1 && property && ts.isPropertyAssignment(property)
          ? property.initializer
          : undefined;
    } else if (!second) {
      task = first;
    }

    const isInline =
      task &&
      (ts.isArrowFunction(task) || (ts.isFunctionExpression(task) && !task.asteriskToken)) &&
      task.parameters.length === 0;

    if (!task || !isInline) {
      return { reason: 'the task is not one function with no parameter, written in the call' };
    }

    return { task, values };
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    /** The file as the reason of a system call names it. */
    shownName: string;
    source: string;
    map: TExecutionScopeMap;
    isNestedRewritten: boolean;
  }): IExecutionScopeRewrite {
    const { typescript: ts, fileName, shownName, source, map, isNestedRewritten } = opts;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const manual: ICodemodRewrite['manual'] = [];
    const lineOf = (node: import('typescript').Node) =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const info = ExecutionScopeRewrite.listeners({ typescript: ts, file }).map(
      ({ node, note }) => ({ line: lineOf(node), note }),
    );
    const definitions = ExecutionScopeRewrite.definitions({ typescript: ts, file, map });

    if (definitions.length > 0) {
      for (const { node, name } of definitions) {
        info.push({
          line: lineOf(node),
          note: `defines the mapped helper "${name}": the file is left as written`,
        });
      }

      return { output: source, changed: false, rewritten: 0, manual, info };
    }

    const imports = file.statements.filter((statement) => ts.isImportDeclaration(statement));
    const moduleOf = (node: import('typescript').ImportDeclaration) =>
      ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
    const isIgnis = (node: import('typescript').ImportDeclaration) =>
      IGNIS_PACKAGES.some(
        (name) => moduleOf(node) === name || moduleOf(node).startsWith(`${name}/`),
      );

    /** Local name of an import to the name it was exported as. */
    const bindings = new Map<string, string>();
    /** The local names `Execution` and `ExecutionModes` already have as values from the framework. */
    const framework = new Map<string, string>();

    for (const statement of imports) {
      const clause = statement.importClause;

      if (clause?.name) {
        bindings.set(clause.name.text, clause.name.text);
      }

      if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
        continue;
      }

      for (const element of clause.namedBindings.elements) {
        const imported = (element.propertyName ?? element.name).text;

        if (!isIgnis(statement)) {
          bindings.set(element.name.text, imported);
        } else if (!clause.isTypeOnly && !element.isTypeOnly) {
          framework.set(imported, element.name.text);
        }
      }
    }

    /** Every use of a name outside the imports, and every name the file declares. */
    const uses = new Map<string, import('typescript').Identifier[]>();
    const declared = new Set<string>();

    const collect = (node: import('typescript').Node): void => {
      if (ts.isImportDeclaration(node)) {
        return;
      }

      const isDeclaration =
        ts.isVariableDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node);

      if (isDeclaration && node.name && ts.isIdentifier(node.name)) {
        declared.add(node.name.text);
      }

      if (ts.isIdentifier(node) && !ExecutionScopeRewrite.isMemberName({ typescript: ts, node })) {
        const found = uses.get(node.text) ?? [];
        found.push(node);
        uses.set(node.text, found);
      }

      ts.forEachChild(node, collect);
    };

    collect(file);

    /** The mapped helper an expression names: `helper`, or `Class.method`. */
    const helperOf = (node: import('typescript').Node) => {
      let local: import('typescript').Identifier;
      let member = '';

      if (ts.isIdentifier(node)) {
        local = node;
      } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        local = node.expression;
        member = `.${node.name.text}`;
      } else {
        return undefined;
      }

      const imported = bindings.get(local.text);
      const key = `${imported}${member}`;

      return imported !== undefined && Object.hasOwn(map, key)
        ? { key, local, entry: map[key] }
        : undefined;
    };

    /** Whether `call` opens a scoped frame: a mapped scoped helper, or `Execution.run` in scoped mode. */
    const isScopedCall = (call: import('typescript').CallExpression) => {
      if (helperOf(call.expression)?.entry.mode === 'scoped') {
        return true;
      }

      const [options] = call.arguments;
      const execution = framework.get(EXECUTION);

      if (
        !execution ||
        call.expression.getText(file) !== `${execution}.run` ||
        !options ||
        !ts.isObjectLiteralExpression(options)
      ) {
        return false;
      }

      return options.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText(file) === 'mode' &&
          /(\.SCOPED|^['"]scoped['"])$/.test(property.initializer.getText(file)),
      );
    };

    const isInsideScoped = (node: import('typescript').Node) => {
      for (let at = node; !ts.isSourceFile(at); at = at.parent) {
        const parent = at.parent;

        if (ts.isCallExpression(parent) && parent.expression !== at && isScopedCall(parent)) {
          return true;
        }
      }

      return false;
    };

    const mentionsHelper = (node: import('typescript').Node): boolean =>
      helperOf(node) !== undefined || (ts.forEachChild(node, mentionsHelper) ?? false);

    /** The local name for an export of the framework, and the import specifier to add when it has none. */
    const localOf = (name: string) => {
      const existing = framework.get(name);

      if (existing) {
        return { local: existing, specifier: undefined };
      }

      const isTaken = (candidate: string) => declared.has(candidate) || bindings.has(candidate);
      const local = isTaken(name) ? `Ignis${name}` : name;

      return { local, specifier: local === name ? name : `${name} as ${local}` };
    };

    const execution = localOf(EXECUTION);
    const modes = localOf(EXECUTION_MODES);
    const edits: ITextEdit[] = [];
    const consumed = new Map<string, number>();
    let rewritten = 0;

    /** Rewrites one call, or lists why it is left. */
    const handle = (
      call: import('typescript').CallExpression,
      helper: NonNullable<ReturnType<typeof helperOf>>,
    ) => {
      const { key, local, entry } = helper;
      const leave = (note: string) => manual.push({ line: lineOf(call), note });

      if (declared.has(local.text)) {
        leave(`${key} is left: the file declares "${local.text}" too`);

        return;
      }

      if (entry.mode === 'system' && !isNestedRewritten && isInsideScoped(call)) {
        leave(
          `${key} is a system call inside a scoped one, so it would see more: review it, then run with ${NESTED_FLAG}`,
        );

        return;
      }

      if (call.questionDotToken || (call.typeArguments?.length ?? 0) > 1) {
        leave(`cannot read this call of ${key}: an optional call or several type arguments`);

        return;
      }

      const read = ExecutionScopeRewrite.readCall({ typescript: ts, file, call, entry });

      if ('reason' in read) {
        leave(`cannot read this call of ${key}: ${read.reason}`);

        return;
      }

      const { task, values } = read;
      const spanOf = (node: import('typescript').Node) => ({
        start: node.getStart(file),
        end: node.getEnd(),
      });
      const taskSpan = spanOf(task);
      const kept = [...values.map(({ node }) => spanOf(node)), taskSpan];
      const typeArguments = call.typeArguments?.map(spanOf) ?? [];
      const span = { start: call.expression.getEnd(), end: call.getEnd() };

      if (
        ExecutionScopeRewrite.hasComment({
          typescript: ts,
          source,
          span,
          kept: [...kept, ...typeArguments],
        })
      ) {
        leave(`cannot read this call of ${key}: a comment between its arguments would be lost`);

        return;
      }

      if (values.some(({ node }) => mentionsHelper(node))) {
        leave(`cannot read this call of ${key}: a value uses a mapped helper`);

        return;
      }

      const parts = [`mode: ${modes.local}.${entry.mode.toUpperCase()}`];

      if (entry.mode === 'system') {
        const method = ExecutionScopeRewrite.methodOf({ typescript: ts, node: call, file });
        const reason = `${TODO_PREFIX}${shownName}:${method})`;
        parts.push(`reason: '${reason.replace(/[\\']/g, '\\$&')}'`);
        leave(`write the reason: '${reason}'`);
      }

      if (values.length > 0) {
        const written = values.map(({ key: name, node }) => {
          const value = node.getText(file);
          const property = IDENTIFIER_PATTERN.test(name) ? name : JSON.stringify(name);

          return property === value ? value : `${property}: ${value}`;
        });
        parts.push(`values: { ${written.join(', ')} }`);
      }

      edits.push(
        { ...spanOf(call.expression), text: `${execution.local}.run` },
        {
          start: call.arguments.pos,
          end: taskSpan.start,
          text: `{ ${parts.join(', ')}, task: `,
        },
        { start: taskSpan.end, end: call.getEnd() - 1, text: ' }' },
      );
      consumed.set(local.text, (consumed.get(local.text) ?? 0) + 1);
      rewritten += 1;
    };

    const visit = (node: import('typescript').Node): void => {
      if (ts.isImportDeclaration(node)) {
        return;
      }

      if (ts.isStringLiteralLike(node) && node.text.startsWith(TODO_PREFIX)) {
        manual.push({ line: lineOf(node), note: `write the reason: '${node.text}'` });
      }

      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const helper = helperOf(callee);

        if (helper) {
          handle(node, helper);
          // The callee is read: only the arguments may hold more.
          node.arguments.forEach(visit);

          return;
        }

        if (ts.isPropertyAccessExpression(callee) && Object.hasOwn(map, callee.name.text)) {
          manual.push({
            line: lineOf(node),
            note: `cannot read this call of ${callee.name.text}: it is called as a member`,
          });
        }
      }

      const isUse =
        (ts.isIdentifier(node) &&
          !ExecutionScopeRewrite.isMemberName({ typescript: ts, node }) &&
          !declared.has(node.text) &&
          !ts.isTypeQueryNode(node.parent)) ||
        ts.isPropertyAccessExpression(node);
      const passed = isUse ? helperOf(node) : undefined;

      if (passed) {
        manual.push({
          line: lineOf(node),
          note: `cannot read this use of ${passed.key}: it is passed as a value`,
        });

        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (rewritten === 0) {
      return { output: source, changed: false, rewritten, manual, info };
    }

    /** The imports of the helpers nothing uses any more. */
    const isDone = (name: import('typescript').Identifier) =>
      consumed.has(name.text) && consumed.get(name.text) === uses.get(name.text)?.length;
    const added = [execution.specifier, modes.specifier].filter((entry) => entry !== undefined);
    const target = imports.find((statement) => {
      const clause = statement.importClause;

      return (
        moduleOf(statement) === IGNIS_MODULE &&
        !clause?.isTypeOnly &&
        clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings)
      );
    });
    const addedImport =
      added.length > 0 && !target
        ? `import { ${added.join(', ')} } from '${IGNIS_MODULE}';`
        : undefined;
    let isImportPlaced = false;

    if (added.length > 0 && target?.importClause?.namedBindings) {
      const named = target.importClause.namedBindings;

      if (ts.isNamedImports(named)) {
        const last = named.elements.at(-1);
        const at = last ? last.getEnd() : named.getStart(file) + 1;
        const text = last ? `, ${added.join(', ')}` : ` ${added.join(', ')} `;
        edits.push({ start: at, end: at, text });
      }
    }

    for (const statement of imports) {
      const clause = statement.importClause;

      if (!clause || isIgnis(statement)) {
        continue;
      }

      const named =
        clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          ? clause.namedBindings
          : undefined;
      const elements = [...(named?.elements ?? [])];
      const remaining = elements.filter((element) => !isDone(element.name));
      const isDefaultDone = clause.name !== undefined && isDone(clause.name);

      if (remaining.length === elements.length && !isDefaultDone) {
        continue;
      }

      const defaultName = isDefaultDone ? undefined : clause.name?.text;
      const namespace = clause.namedBindings && !named;

      if (!defaultName && !namespace && remaining.length === 0) {
        // The whole statement goes: the new import takes its place, or its line goes with it.
        const start = statement.getStart(file);
        const newline = /^[ \t]*\r?\n/.exec(source.slice(statement.getEnd()));

        if (addedImport && !isImportPlaced) {
          edits.push({ start, end: statement.getEnd(), text: addedImport });
          isImportPlaced = true;
        } else {
          edits.push({ start, end: statement.getEnd() + (newline?.[0].length ?? 0), text: '' });
        }

        continue;
      }

      const names = remaining.map((element) => element.getText(file));
      const braces = names.length > 0 ? `{ ${names.join(', ')} }` : undefined;
      const rest = namespace ? clause.namedBindings?.getText(file) : braces;
      const type = clause.isTypeOnly ? 'type ' : '';

      edits.push({
        start: clause.getStart(file),
        end: clause.getEnd(),
        text: `${type}${[defaultName, rest].filter(Boolean).join(', ')}`,
      });
    }

    if (addedImport && !isImportPlaced) {
      const last = imports.at(-1);
      const at = last ? last.getEnd() : (file.statements[0]?.getStart(file) ?? 0);
      const text = last ? `\n${addedImport}` : `${addedImport}\n`;
      edits.push({ start: at, end: at, text });
    }

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten, manual, info };
  }
}

/** `devz codemod execution-scope`: an application's own scope helpers to `Execution.run`. */
export class ExecutionScopeCommand {
  static readonly USAGE = USAGE;

  private static refuse(message: string): number {
    CliOutput.error(`devz codemod execution-scope: ${message}\n${USAGE}`);

    return USAGE_ERROR_CODE;
  }

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;
    const isNestedRewritten = args.includes(NESTED_FLAG);
    const rest = args.filter((argument) => argument !== NESTED_FLAG);
    const at = rest.indexOf(MAP_FLAG);
    const mapPath = at < 0 ? undefined : rest.splice(at, 2)[1];
    let map: TExecutionScopeMap = {};

    if (!args.includes('--help') && !args.includes('-h')) {
      if (!mapPath || mapPath.startsWith('-')) {
        return ExecutionScopeCommand.refuse(`${MAP_FLAG} <file.json> is required`);
      }

      let text: string;

      try {
        text = readFileSync(resolve(root, mapPath), 'utf8');
      } catch (error) {
        return ExecutionScopeCommand.refuse(`cannot read ${mapPath}: ${String(error)}`);
      }

      const parsed = ExecutionScopeMapReader.parse({ text });

      if ('error' in parsed) {
        return ExecutionScopeCommand.refuse(`${mapPath}: ${parsed.error}`);
      }

      map = parsed.map;
    }

    return ClassRenamesCommand.run({
      root,
      args: rest,
      codemod: {
        name: 'execution-scope',
        usage: USAGE,
        isReversible: false,
        unit: { noun: 'call(s)', verb: 'rewritten' },
        // The names of the helpers, and what marks a handler, a consumer or a reason still to write.
        marks: () => [
          ...Object.keys(map).flatMap((key) => key.split('.').slice(-1)),
          'IEventHandler',
          '.register(',
          'onWorkerData',
          'onMessage',
          TODO_PREFIX,
        ],
        rewrite: (input) =>
          ExecutionScopeRewrite.rewrite({
            ...input,
            shownName: relative(root, input.fileName).split('\\').join('/'),
            map,
            isNestedRewritten,
          }),
      },
    });
  }
}
