import { ClassRenamesCommand, type ICodemodRewrite } from './class-renames';

const USAGE = `Usage: devz codemod async-context [paths...] [--write [--all] | --check]

The application config no longer has "asyncContext": every request is an execution frame. It removes
"asyncContext: { enable: ... }" and the comment above it from an application config: an object that has another
config key (such as path, port or transports), stands under "config", or is typed ...ApplicationConfigs. It lists by
file and line what it leaves for you: any other "asyncContext" property (a shorthand, a quoted name, a variable), an
override of getDefaultAsyncContextEnabled, and a read of configs.asyncContext.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change or a line is left for you (for CI)
  --help     print this text and exit

There is no --reverse: a downgrade restores the files from git.`;

/** The keys that tell an object is an application config. */
const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'artifacts',
  'bootChecks',
  'debug',
  'error',
  'favicon',
  'host',
  'middlewares',
  'path',
  'port',
  'projectRoot',
  'server',
  'transports',
]);

/** Removes the `asyncContext` key of an application config. */
export class AsyncContextRemoval {
  /** Whether `object` is an application config: by another key of it, by where it stands, or by its declared type. */
  private static isConfig(opts: {
    typescript: typeof import('typescript');
    object: import('typescript').ObjectLiteralExpression;
    file: import('typescript').SourceFile;
  }) {
    const { typescript: ts, object, file } = opts;
    const hasKey = object.properties.some((property) =>
      CONFIG_KEYS.has(property.name?.getText(file) ?? ''),
    );
    const parent = object.parent;

    if (
      hasKey ||
      (ts.isPropertyAssignment(parent) && /^configs?$/.test(parent.name.getText(file)))
    ) {
      return true;
    }

    const isTyped =
      ts.isVariableDeclaration(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isAsExpression(parent);

    return isTyped && (parent.type?.getText(file).includes('ApplicationConfigs') ?? false);
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): ICodemodRewrite {
    const { typescript: ts, fileName, source } = opts;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const removals: Array<{ start: number; end: number }> = [];
    const manual: ICodemodRewrite['manual'] = [];
    const lineOf = (node: import('typescript').Node) =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    /** Whether `node` is `asyncContext: { enable: ... }` and nothing more. */
    const isKey = (node: import('typescript').Node) => {
      if (!ts.isPropertyAssignment(node) || node.name.getText(file) !== 'asyncContext') {
        return false;
      }

      const value = node.initializer;

      return (
        ts.isObjectLiteralExpression(value) &&
        value.properties.length === 1 &&
        value.properties[0].name?.getText(file) === 'enable'
      );
    };

    const visit = (node: import('typescript').Node): void => {
      if (
        isKey(node) &&
        ts.isObjectLiteralExpression(node.parent) &&
        AsyncContextRemoval.isConfig({ typescript: ts, object: node.parent, file })
      ) {
        removals.push(
          AsyncContextRemoval.spanOf({ typescript: ts, source, node, object: node.parent, file }),
        );

        return;
      }

      const isProperty =
        (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
        node.name.getText(file).replace(/['"]/g, '') === 'asyncContext';

      if (isProperty) {
        manual.push({
          line: lineOf(node),
          note: 'asyncContext is left as written: remove it if this is an application config',
        });
      }

      if (
        ts.isMethodDeclaration(node) &&
        node.name.getText(file) === 'getDefaultAsyncContextEnabled'
      ) {
        manual.push({
          line: lineOf(node),
          note: 'remove the getDefaultAsyncContextEnabled override',
        });
      }

      if (ts.isPropertyAccessExpression(node) && node.name.text === 'asyncContext') {
        manual.push({ line: lineOf(node), note: 'configs.asyncContext is gone' });
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    let output = source;

    for (const removal of removals.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, removal.start) + output.slice(removal.end);
    }

    return { output, changed: output !== source, rewritten: removals.length, manual };
  }

  /** The text to cut for a property: its whole line when it has one to itself, else the property and one comma. */
  private static spanOf(opts: {
    typescript: typeof import('typescript');
    source: string;
    node: import('typescript').Node;
    object: import('typescript').ObjectLiteralExpression;
    file: import('typescript').SourceFile;
  }) {
    const { typescript: ts, source, node, object, file } = opts;
    const start = node.getStart(file);
    const comma = /^\s*,/.exec(source.slice(node.getEnd()));
    const end = node.getEnd() + (comma?.[0].length ?? 0);
    const lineStart = source.lastIndexOf('\n', start) + 1;
    const rest = /^[ \t]*\r?\n/.exec(source.slice(end));

    if (source.slice(lineStart, start).trim() === '' && rest) {
      // The comment lines above the key describe it: they go with it.
      const [comment] = ts.getLeadingCommentRanges(source, node.pos) ?? [];
      const commentLine = comment ? source.lastIndexOf('\n', comment.pos) + 1 : lineStart;
      const isOwnLine = comment && source.slice(commentLine, comment.pos).trim() === '';

      return { start: isOwnLine ? commentLine : lineStart, end: end + rest[0].length };
    }

    if (object.properties.length === 1) {
      return { start: object.getStart(file) + 1, end: object.getEnd() - 1 };
    }

    if (comma) {
      return { start, end: end + (/^[ \t]*/.exec(source.slice(end))?.[0].length ?? 0) };
    }

    // The last member of a one-line object: the comma before it goes instead.
    const before = /,\s*$/.exec(source.slice(0, start));

    return { start: start - (before?.[0].length ?? 0), end };
  }
}

/** `devz codemod async-context`: removes the `asyncContext` key of an application config. */
export class AsyncContextCommand {
  static readonly USAGE = USAGE;

  static run(opts: { root: string; args: string[] }): Promise<number> {
    return ClassRenamesCommand.run({
      ...opts,
      codemod: {
        name: 'async-context',
        usage: USAGE,
        marks: () => ['asyncContext', 'AsyncContext'],
        isReversible: false,
        isRemoval: true,
        rewrite: (input) => AsyncContextRemoval.rewrite(input),
      },
    });
  }
}
