import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type ts from 'typescript';

/**
 * A positive control is a test that proves a gate can fail: a fixture that must be refused, a broken
 * subject the check must catch. Deleting one makes the gate pass for the wrong reason, so the trim-tests
 * method keeps a committed registry of them and fails when one disappears.
 */
export interface IControlEntry {
  /** The gate the control belongs to; reported with a failure. */
  gate: string;
  /** Repository-relative path of the test file. */
  file: string;
  /** A regular expression matched against the TITLES (suite and case) in that file. */
  titlePattern: string;
  /** At least this many titles must match. Default 1. */
  min?: number;
}

export interface IControlProblem {
  entry: IControlEntry;
  message: string;
}

export interface IControlsReport {
  checked: number;
  problems: IControlProblem[];
}

/**
 * The titles in a test file: the first string argument of `test`, `it`, `describe` and of the
 * second call of `test.each(rows)('title', ...)`, with their `.only`/`.skip`/`.if(...)` forms.
 * A `test.each` title is returned as written (`%s` and all): the registry patterns are regular
 * expressions, so the expansion does not matter.
 */
export const listTestTitles = async (opts: {
  source: string;
  fileName?: string;
}): Promise<string[]> => {
  const typescript: typeof ts = (await import('typescript')).default;
  const file = typescript.createSourceFile(
    opts.fileName ?? 'file.test.ts',
    opts.source,
    typescript.ScriptTarget.Latest,
    true,
  );
  const titles: string[] = [];
  const RUNNERS = new Set(['test', 'it', 'describe']);

  const rootName = (expression: ts.Expression): string | undefined => {
    if (typescript.isIdentifier(expression)) {
      return expression.text;
    }

    if (typescript.isPropertyAccessExpression(expression)) {
      return rootName(expression.expression);
    }

    if (typescript.isCallExpression(expression)) {
      return rootName(expression.expression);
    }

    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (typescript.isCallExpression(node)) {
      const first = node.arguments[0];
      const root = rootName(node.expression);

      if (
        root !== undefined &&
        RUNNERS.has(root) &&
        first &&
        (typescript.isStringLiteral(first) || typescript.isNoSubstitutionTemplateLiteral(first))
      ) {
        titles.push(first.text);
      }
    }

    typescript.forEachChild(node, visit);
  };

  visit(file);

  return titles;
};

/** Checks every entry of the registry against the test files it names. */
export const checkControls = async (opts: {
  root: string;
  controls: IControlEntry[];
}): Promise<IControlsReport> => {
  const problems: IControlProblem[] = [];

  for (const entry of opts.controls) {
    const path = join(opts.root, entry.file);
    if (!existsSync(path)) {
      problems.push({ entry, message: `the test file ${entry.file} does not exist` });
      continue;
    }

    const titles = await listTestTitles({
      source: readFileSync(path, 'utf8'),
      fileName: entry.file,
    });
    const pattern = new RegExp(entry.titlePattern);
    const matched = titles.filter((title) => pattern.test(title)).length;
    const min = entry.min ?? 1;

    if (matched < min) {
      problems.push({
        entry,
        message: `${matched} title(s) match /${entry.titlePattern}/ in ${entry.file}, ${min} required | the control of gate '${entry.gate}' is gone or renamed`,
      });
    }
  }

  return { checked: opts.controls.length, problems };
};
