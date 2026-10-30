/**
 * The table behind `devz codemod namespace-functions`. One entry per public function that moved into
 * a class: the old name stays exported as a `@deprecated` alias with its old positional signature,
 * and the codemod moves callers to the class form.
 *
 * How an entry is written, in the file of the package that exports the old name
 * (`mappings/<package-dir>.ts`):
 *
 * ```ts
 * {
 *   // Every module specifier the old name can be imported from: the root, a subpath, a re-export.
 *   modules: ['@venizia/ignis-helpers', '@venizia/ignis-helpers/core'],
 *   oldName: 'float',
 *   className: 'ParseUtility',
 *   method: 'toFloat',
 *   // Where the class is imported from, when that is not where the old name came from. Optional.
 *   newModules: ['@venizia/ignis-helpers'],
 *   // The old positional parameters in order; each becomes a key of the options object. A parameter
 *   // that has a default value in the old function is `optional`, and an optional one is never
 *   // followed by a required one.
 *   params: [{ key: 'input' }, { key: 'digit', optional: true }],
 *   // The old rest parameter, if any (`float` has none): its arguments go under this key as one
 *   // array, `[]` when the call passes none. Optional.
 *   // restKey: 'values',
 * }
 * ```
 *
 * So `float(value, 3)` becomes `ParseUtility.toFloat({ input: value, digit: 3 })`, and `float(input)`
 * becomes `ParseUtility.toFloat({ input })`. Add the entry in the pull request that adds the class
 * and the deprecated alias, never before: the codemod would rewrite callers to a method that does not
 * exist yet. `NamespaceMappings.validate` checks every entry in the test suite.
 */

/** One old positional parameter, and the key it becomes in the options object. */
export interface INamespaceMappingParameter {
  key: string;
  /** The old parameter has a default value: a call may leave it out, and then the key is left out. */
  optional?: boolean;
}

/** One function that moved into a class. */
export interface INamespaceMapping {
  /** Every module specifier the old name can be imported from. */
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  /** Where the class is imported from; without it, from the module the old name was imported from. */
  newModules?: string[];
  /** The old positional parameters, in order. */
  params: INamespaceMappingParameter[];
  /** The old rest parameter: its arguments are passed as one array under this key. */
  restKey?: string;
  /**
   * The old function already takes ONE options object and the method takes the same one, so a call
   * keeps its arguments and only the callee changes: `isEmpty({ value })` becomes
   * `ObjectUtility.isEmpty({ value })`. `params` is empty and `restKey` unset for such an entry.
   */
  keepsOptions?: boolean;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Checks a mapping table. */
export class NamespaceMappings {
  /** What is wrong with the table, one line per problem; empty when every entry is usable. */
  static validate(opts: { mappings: ReadonlyArray<INamespaceMapping> }): string[] {
    const { mappings } = opts;
    const problems: string[] = [];
    const seen = new Set<string>();

    for (const mapping of mappings) {
      const label = `${mapping.oldName} -> ${mapping.className}.${mapping.method}`;

      for (const [field, value] of [
        ['oldName', mapping.oldName],
        ['className', mapping.className],
        ['method', mapping.method],
      ] as const) {
        if (!IDENTIFIER.test(value)) {
          problems.push(`${label}: ${field} "${value}" is not an identifier`);
        }
      }

      if (mapping.modules.length === 0 || mapping.modules.some((module) => module.trim() === '')) {
        problems.push(`${label}: modules must list at least one module specifier, none empty`);
      }

      if (mapping.newModules?.length === 0) {
        problems.push(`${label}: newModules, when given, lists at least one module specifier`);
      }

      const keys = new Set<string>();
      let isOptionalSeen = false;
      for (const parameter of mapping.params) {
        if (!IDENTIFIER.test(parameter.key)) {
          problems.push(`${label}: the parameter key "${parameter.key}" is not an identifier`);
        }

        if (keys.has(parameter.key)) {
          problems.push(`${label}: the parameter key "${parameter.key}" is listed twice`);
        }
        keys.add(parameter.key);

        if (isOptionalSeen && !parameter.optional) {
          problems.push(
            `${label}: the required parameter "${parameter.key}" follows an optional one`,
          );
        }
        isOptionalSeen = isOptionalSeen || parameter.optional === true;
      }

      if (mapping.restKey !== undefined) {
        if (!IDENTIFIER.test(mapping.restKey)) {
          problems.push(`${label}: restKey "${mapping.restKey}" is not an identifier`);
        }

        if (keys.has(mapping.restKey)) {
          problems.push(`${label}: restKey "${mapping.restKey}" is also a parameter key`);
        }
      }

      if (mapping.keepsOptions && (mapping.params.length > 0 || mapping.restKey !== undefined)) {
        problems.push(`${label}: keepsOptions leaves params empty and restKey unset`);
      }

      for (const module of mapping.modules) {
        const id = `${module}#${mapping.oldName}`;
        if (seen.has(id)) {
          problems.push(`${label}: ${mapping.oldName} from ${module} has two entries`);
        }
        seen.add(id);
      }
    }

    return problems;
  }
}
