import { AnyAliasesCommand } from './any-aliases';
import { AsyncStyleCommand } from './async-style';
import { BindingKeysCommand } from './binding-keys';
import { ClassRenamesCommand } from './class-renames';
import { ConnectorImportsCommand } from './connector-imports';
import { ConstClassesCommand } from './const-classes';
import { EnvGetCommand } from './env-get';
import { FunctionToArrowCommand } from './function-to-arrow';
import { DropRedundantCastsCommand } from './drop-redundant-casts';
import { NamespaceFunctionsCommand } from './namespace-functions';
import { CliOutput } from '../../common/cli-output';

const USAGE = [
  DropRedundantCastsCommand.USAGE,
  ConstClassesCommand.USAGE,
  AsyncStyleCommand.USAGE,
  NamespaceFunctionsCommand.USAGE,
  ConnectorImportsCommand.USAGE,
  EnvGetCommand.USAGE,
  AnyAliasesCommand.USAGE,
  BindingKeysCommand.USAGE,
  ClassRenamesCommand.USAGE,
  FunctionToArrowCommand.USAGE,
].join('\n\n');

/** The codemods `devz codemod <name>` runs. */
const NAME_LIST = [
  'drop-redundant-casts',
  'const-classes',
  'async-style',
  'namespace-functions',
  'connector-imports',
  'env-get',
  'any-aliases',
  'binding-keys',
  'class-renames',
  'function-to-arrow',
];
const NAMES = NAME_LIST.join(', ');

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The codemods that are style rewrites, not migrations: there is no downgrade of them. */
const NOT_REVERSIBLE = new Set([
  'drop-redundant-casts',
  'const-classes',
  'async-style',
  'env-get',
  'any-aliases',
  'binding-keys',
  'function-to-arrow',
]);

/** `devz codemod <name> [args]`: hands the arguments to the codemod called `name`. */
export class CodemodCommand {
  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { args } = opts;
    const [name, ...rest] = args;

    if (name === '--list') {
      CliOutput.log(NAME_LIST.join('\n'));

      return 0;
    }

    if (name !== undefined && NOT_REVERSIBLE.has(name) && rest.includes('--reverse')) {
      CliOutput.error(`devz codemod ${name}: not reversible`);

      return USAGE_ERROR_CODE;
    }

    if (name === 'drop-redundant-casts') {
      return DropRedundantCastsCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'const-classes') {
      return ConstClassesCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'async-style') {
      return AsyncStyleCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'namespace-functions') {
      return NamespaceFunctionsCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'connector-imports') {
      return ConnectorImportsCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'env-get') {
      return EnvGetCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'any-aliases') {
      return AnyAliasesCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'binding-keys') {
      return BindingKeysCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'function-to-arrow') {
      return FunctionToArrowCommand.run({ root: opts.root, args: rest });
    }

    if (name === 'class-renames') {
      return ClassRenamesCommand.run({ root: opts.root, args: rest });
    }

    if (args.includes('--help') || args.includes('-h')) {
      CliOutput.log(USAGE);

      return 0;
    }

    CliOutput.error(
      `devz codemod: unknown codemod "${name ?? ''}" | the codemods are: ${NAMES}\n\n${USAGE}`,
    );

    return USAGE_ERROR_CODE;
  }
}
