import { AsyncStyleCommand } from './async-style';
import { ConnectorImportsCommand } from './connector-imports';
import { ConstClassesCommand } from './const-classes';
import { DropRedundantCastsCommand } from './drop-redundant-casts';
import { NamespaceFunctionsCommand } from './namespace-functions';

const USAGE = [
  DropRedundantCastsCommand.USAGE,
  ConstClassesCommand.USAGE,
  AsyncStyleCommand.USAGE,
  NamespaceFunctionsCommand.USAGE,
  ConnectorImportsCommand.USAGE,
].join('\n\n');

/** The codemods `devz codemod <name>` runs. */
const NAMES = [
  'drop-redundant-casts',
  'const-classes',
  'async-style',
  'namespace-functions',
  'connector-imports',
].join(', ');

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** `devz codemod <name> [args]`: hands the arguments to the codemod called `name`. */
export class CodemodCommand {
  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { args } = opts;
    const [name, ...rest] = args;

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

    if (args.includes('--help') || args.includes('-h')) {
      console.log(USAGE);
      return 0;
    }

    console.error(
      `devz codemod: unknown codemod "${name ?? ''}" | the codemods are: ${NAMES}\n\n${USAGE}`,
    );
    return USAGE_ERROR_CODE;
  }
}
