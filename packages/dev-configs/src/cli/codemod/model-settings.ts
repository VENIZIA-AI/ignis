import type ts from 'typescript';

type TTypeScript = typeof ts;

/** The packages that export the `@model` decorator, so an aliased import of it is recognised. */
const MODEL_MODULES = new Set<string>(['@venizia/ignis', '@venizia/ignis-kernel']);

/** One thing the codemod could not decide and left alone. */
export interface IModelSettingsReport {
  line: number;
  column: number;
  reason: string;
}

export interface IModelSettingsResult {
  /** The source after the migration; equal to the input when nothing changed. */
  output: string;
  changed: boolean;
  /** How many `@model` settings objects were rewritten. */
  rewritten: number;
  reports: IModelSettingsReport[];
}

interface IEdit {
  start: number;
  end: number;
  text: string;
}

const QUERY_KEYS = { defaultFilter: 'filter', defaultLimit: 'default', maxLimit: 'max' } as const;
const OLD_KEYS = new Set<string>([...Object.keys(QUERY_KEYS), 'scopeFilter']);

/**
 * Rewrites `@model({ ... })` from the old keys to the grouped ones. `skipMigrate` becomes
 * `migration: { use: false }`. In the `settings` object literal:
 * `defaultFilter` to `query.filter`, `defaultLimit` and `maxLimit` to `query.limit.default` and
 * `query.limit.max`, `scopeFilter` to `access` (`writeGuard` to `write.mode`, `sharedRows` to
 * `write.sharedRows`).
 *
 * It edits by source range, so comments and formatting outside the rewritten properties stay. It
 * never guesses: a `settings` value that is not an object literal, a spread, a computed key, or a
 * `scopeFilter` that is not an object literal is reported and the model is left untouched.
 */
export const migrateModelSettings = (opts: {
  typescript: TTypeScript;
  fileName: string;
  source: string;
}): IModelSettingsResult => {
  const { typescript, fileName, source } = opts;
  const sourceFile = typescript.createSourceFile(
    fileName,
    source,
    typescript.ScriptTarget.Latest,
    true,
  );
  const edits: IEdit[] = [];
  const reports: IModelSettingsReport[] = [];
  let rewritten = 0;

  const report = (node: ts.Node, reason: string) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    reports.push({ line: line + 1, column: character + 1, reason });
  };

  const nameOf = (property: ts.ObjectLiteralElementLike): string | undefined => {
    if (
      !typescript.isPropertyAssignment(property) &&
      !typescript.isShorthandPropertyAssignment(property)
    ) {
      return undefined;
    }

    const { name } = property;
    if (typescript.isIdentifier(name) || typescript.isStringLiteral(name)) {
      return name.text;
    }

    return undefined;
  };

  const text = (node: ts.Node) => source.slice(node.getStart(sourceFile), node.end);

  // Names that mean `@model`: the identifier itself, an alias of a named import from IGNIS, and the
  // namespace of `import * as ignis` (`@ignis.model(...)`).
  const modelNames = new Set<string>(['model']);
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !typescript.isImportDeclaration(statement) ||
      !typescript.isStringLiteral(statement.moduleSpecifier) ||
      !MODEL_MODULES.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings) {
      continue;
    }

    if (typescript.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }

    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'model') {
        modelNames.add(element.name.text);
      }
    }
  }

  const isModelCallee = (callee: ts.Expression): boolean => {
    if (typescript.isIdentifier(callee)) {
      return modelNames.has(callee.text);
    }

    return (
      typescript.isPropertyAccessExpression(callee) &&
      typescript.isIdentifier(callee.expression) &&
      namespaces.has(callee.expression.text) &&
      callee.name.text === 'model'
    );
  };

  /**
   * The leading trivia of `first` (its own comments and indentation) followed by the comments that
   * were above the properties being merged into it, so no comment is dropped.
   */
  const composeLeading = (first: ts.Node, merged: ts.Node[]): string => {
    const trivia = source.slice(first.getFullStart(), first.getStart(sourceFile));
    const indent = /[ \t]*$/.exec(trivia)?.[0] ?? '';
    const extra = merged
      .flatMap((node) => typescript.getLeadingCommentRanges(source, node.getFullStart()) ?? [])
      .map((range) => `${source.slice(range.pos, range.end)}\n${indent}`)
      .join('');

    return trivia + extra;
  };

  /**
   * Removes a property with the comma after it; the last property has none, so the comma before it
   * goes instead, leaving no dangling `, }`.
   */
  const removal = (node: ts.Node): IEdit => {
    const after = /^\s*,/.exec(source.slice(node.end));
    if (after) {
      return { start: node.getFullStart(), end: node.end + after[0].length, text: '' };
    }

    const before = /,\s*$/.exec(source.slice(0, node.getFullStart()));
    const start = before ? node.getFullStart() - before[0].length : node.getFullStart();

    return { start, end: node.end, text: '' };
  };

  /** Appends members to an object literal: after its last member, or inside empty braces. */
  const append = (object: ts.ObjectLiteralExpression, members: string[]): IEdit => {
    const last = object.properties[object.properties.length - 1];
    if (last) {
      return { start: last.end, end: last.end, text: `, ${members.join(', ')}` };
    }

    const at = object.getStart(sourceFile) + 1;
    return { start: at, end: at, text: ` ${members.join(', ')} ` };
  };

  const migrateSettings = (settings: ts.ObjectLiteralExpression) => {
    const properties = [...settings.properties];
    const old = new Map<string, ts.PropertyAssignment>();
    let existingQuery: ts.PropertyAssignment | undefined;

    for (const property of properties) {
      if (typescript.isSpreadAssignment(property)) {
        // A spread can carry old keys we cannot see.
        report(property, 'settings contains a spread, so its keys are unknown; left untouched');
        return;
      }

      if (typescript.isMethodDeclaration(property)) {
        continue;
      }

      const name = nameOf(property);
      if (name === undefined) {
        report(property, 'settings contains a computed key; left untouched');
        return;
      }

      if (OLD_KEYS.has(name)) {
        if (!typescript.isPropertyAssignment(property)) {
          report(property, `settings.${name} is a shorthand property; left untouched`);
          return;
        }
        old.set(name, property);
      }

      if (name === 'query' && typescript.isPropertyAssignment(property)) {
        existingQuery = property;
      }
    }

    if (old.size === 0) {
      return;
    }

    const queryOld = [...old.keys()].filter((key) => key in QUERY_KEYS);
    const localEdits: IEdit[] = [];

    // ---- scopeFilter -> access (rename the key, rewrite writeGuard / sharedRows inside)
    const scopeFilter = old.get('scopeFilter');
    if (scopeFilter) {
      if (!typescript.isObjectLiteralExpression(scopeFilter.initializer)) {
        report(scopeFilter, 'settings.scopeFilter is not an object literal; left untouched');
        return;
      }

      const inner = scopeFilter.initializer;
      const guard = inner.properties.find(
        (property) =>
          nameOf(property) === 'writeGuard' && typescript.isPropertyAssignment(property),
      ) as ts.PropertyAssignment | undefined;
      const shared = inner.properties.find(
        (property) =>
          nameOf(property) === 'sharedRows' && typescript.isPropertyAssignment(property),
      ) as ts.PropertyAssignment | undefined;
      const hasSpread = inner.properties.some((property) =>
        typescript.isSpreadAssignment(property),
      );

      if (hasSpread) {
        report(scopeFilter, 'settings.scopeFilter contains a spread; left untouched');
        return;
      }

      if (inner.properties.some((property) => nameOf(property) === 'write')) {
        report(scopeFilter, 'settings.scopeFilter already has a write key; left untouched');
        return;
      }

      localEdits.push({
        start: scopeFilter.name.getStart(sourceFile),
        end: scopeFilter.name.end,
        text: 'access',
      });

      if (guard || shared) {
        const members = [
          guard ? `mode: ${text(guard.initializer)}` : undefined,
          shared ? `sharedRows: ${text(shared.initializer)}` : undefined,
        ].filter((member): member is string => member !== undefined);
        const ordered = [guard, shared]
          .filter((property): property is ts.PropertyAssignment => property !== undefined)
          .sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile));
        const [first, ...merged] = ordered;

        localEdits.push({
          start: first.getFullStart(),
          end: first.end,
          text: `${composeLeading(first, merged)}write: { ${members.join(', ')} }`,
        });

        for (const second of merged) {
          localEdits.push(removal(second));
        }
      }
    }

    // ---- defaultFilter / defaultLimit / maxLimit -> query
    if (queryOld.length > 0) {
      const filter = old.get('defaultFilter');
      const defaultLimit = old.get('defaultLimit');
      const maxLimit = old.get('maxLimit');

      if (existingQuery) {
        if (!typescript.isObjectLiteralExpression(existingQuery.initializer)) {
          report(existingQuery, 'settings.query is not an object literal; left untouched');
          return;
        }

        const queryObject = existingQuery.initializer;
        const queryKeys = new Set(queryObject.properties.map((property) => nameOf(property)));
        const existingLimit = queryObject.properties.find(
          (property) => nameOf(property) === 'limit',
        ) as ts.PropertyAssignment | undefined;

        if (filter && queryKeys.has('filter')) {
          report(
            filter,
            'settings.defaultFilter and settings.query.filter are both set; left untouched',
          );
          return;
        }

        if ((defaultLimit || maxLimit) && existingLimit) {
          if (!typescript.isObjectLiteralExpression(existingLimit.initializer)) {
            report(existingLimit, 'settings.query.limit is not an object literal; left untouched');
            return;
          }

          const limitKeys = new Set(
            existingLimit.initializer.properties.map((property) => nameOf(property)),
          );
          if ((defaultLimit && limitKeys.has('default')) || (maxLimit && limitKeys.has('max'))) {
            report(existingLimit, 'an old limit key and its new key are both set; left untouched');
            return;
          }
        }

        const additions: string[] = [];
        if (filter) {
          additions.push(`filter: ${text(filter.initializer)}`);
        }

        const limitMembers = [
          defaultLimit ? `default: ${text(defaultLimit.initializer)}` : undefined,
          maxLimit ? `max: ${text(maxLimit.initializer)}` : undefined,
        ].filter((member): member is string => member !== undefined);

        if (limitMembers.length > 0 && existingLimit) {
          localEdits.push(
            append(existingLimit.initializer as ts.ObjectLiteralExpression, limitMembers),
          );
        } else if (limitMembers.length > 0) {
          additions.push(`limit: { ${limitMembers.join(', ')} }`);
        }

        if (additions.length > 0) {
          localEdits.push(append(queryObject, additions));
        }

        for (const key of queryOld) {
          const property = old.get(key) as ts.PropertyAssignment;
          localEdits.push(removal(property));
        }
      } else {
        const members: string[] = [];
        if (filter) {
          members.push(`filter: ${text(filter.initializer)}`);
        }

        const limitMembers = [
          defaultLimit ? `default: ${text(defaultLimit.initializer)}` : undefined,
          maxLimit ? `max: ${text(maxLimit.initializer)}` : undefined,
        ].filter((member): member is string => member !== undefined);
        if (limitMembers.length > 0) {
          members.push(`limit: { ${limitMembers.join(', ')} }`);
        }

        const ordered = queryOld
          .map((key) => old.get(key) as ts.PropertyAssignment)
          .sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile));
        const [first, ...others] = ordered;

        localEdits.push({
          start: first.getFullStart(),
          end: first.end,
          text: `${composeLeading(first, others)}query: { ${members.join(', ')} }`,
        });

        for (const other of others) {
          localEdits.push(removal(other));
        }
      }
    }

    edits.push(...localEdits);
    rewritten += 1;
  };

  /**
   * `skipMigrate: true` becomes `migration: { use: false }`; `skipMigrate: false` is the default and
   * is removed. Anything that is not a boolean literal, or a model that already has `migration`, is
   * reported and left alone.
   */
  const migrateSkipMigrate = (argument: ts.ObjectLiteralExpression) => {
    const property = argument.properties.find((candidate) => nameOf(candidate) === 'skipMigrate');
    if (!property) {
      return;
    }

    if (!typescript.isPropertyAssignment(property)) {
      report(property, 'skipMigrate is a shorthand property; left untouched');
      return;
    }

    if (argument.properties.some((candidate) => nameOf(candidate) === 'migration')) {
      report(property, 'skipMigrate and migration are both set; left untouched');
      return;
    }

    const { initializer } = property;
    if (initializer.kind === typescript.SyntaxKind.TrueKeyword) {
      edits.push({
        start: property.getStart(sourceFile),
        end: property.end,
        text: 'migration: { use: false }',
      });
    } else if (initializer.kind === typescript.SyntaxKind.FalseKeyword) {
      edits.push(removal(property));
    } else {
      report(property, 'skipMigrate is not a boolean literal; left untouched');
      return;
    }

    rewritten += 1;
  };

  const visit = (node: ts.Node) => {
    if (
      typescript.isDecorator(node) &&
      typescript.isCallExpression(node.expression) &&
      isModelCallee(node.expression.expression)
    ) {
      const argument = node.expression.arguments[0];

      if (argument && typescript.isObjectLiteralExpression(argument)) {
        const settingsProperty = argument.properties.find(
          (property) => nameOf(property) === 'settings',
        );

        if (settingsProperty) {
          if (
            typescript.isPropertyAssignment(settingsProperty) &&
            typescript.isObjectLiteralExpression(settingsProperty.initializer)
          ) {
            migrateSettings(settingsProperty.initializer);
          } else {
            report(
              settingsProperty,
              'settings is not an object literal (a variable, a call or a shorthand); left untouched',
            );
          }
        }

        migrateSkipMigrate(argument);
      } else if (argument) {
        report(
          argument,
          '@model argument is not an object literal (a variable or a call); left untouched',
        );
      }
    }

    typescript.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Neighbouring removals can touch the same comma: merge those, then apply from the end so
  // earlier offsets stay valid.
  const ascending = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: IEdit[] = [];
  for (const edit of ascending) {
    const previous = merged[merged.length - 1];
    if (previous && edit.start < previous.end && previous.text === '' && edit.text === '') {
      previous.end = Math.max(previous.end, edit.end);
      continue;
    }

    merged.push({ ...edit });
  }

  let output = source;
  for (const edit of merged.reverse()) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  return { output, changed: output !== source, rewritten, reports };
};
