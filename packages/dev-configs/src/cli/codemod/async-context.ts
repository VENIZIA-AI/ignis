import { ClassRenamesCommand, type ICodemodRewrite } from './class-renames';

const USAGE = `Usage: devz codemod async-context [paths...] [--write [--all] | --check]

The application config no longer has "asyncContext": every request is an execution frame. It removes each
"asyncContext: { enable: ... }" property, and lists by file and line what it leaves for you: an override of
getDefaultAsyncContextEnabled, and a read of configs.asyncContext.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

There is no --reverse: a downgrade restores the files from git.`;

/** Removes the `asyncContext` key of an application config. */
export class AsyncContextRemoval {
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
      if (isKey(node) && ts.isObjectLiteralExpression(node.parent)) {
        removals.push(AsyncContextRemoval.spanOf({ source, node, object: node.parent, file }));

        return;
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
    source: string;
    node: import('typescript').Node;
    object: import('typescript').ObjectLiteralExpression;
    file: import('typescript').SourceFile;
  }) {
    const { source, node, object, file } = opts;
    const start = node.getStart(file);
    const comma = /^\s*,/.exec(source.slice(node.getEnd()));
    const end = node.getEnd() + (comma?.[0].length ?? 0);
    const lineStart = source.lastIndexOf('\n', start) + 1;
    const rest = /^[ \t]*\r?\n/.exec(source.slice(end));

    if (source.slice(lineStart, start).trim() === '' && rest) {
      return { start: lineStart, end: end + rest[0].length };
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
        rewrite: (input) => AsyncContextRemoval.rewrite(input),
      },
    });
  }
}
