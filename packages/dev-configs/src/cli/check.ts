import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { checkPurity } from '../checks/purity/run';
import type { IPurityClaim, IPurityOptions } from '../checks/purity/manifest';

const USAGE = `Usage: devz check <name> [options]

Checks:
  purity [package] --claims <file> [--json]   probe every entry claimed browser-pure (needs a build)

purity
  --claims <file>   a module that exports PURITY_CLAIMS (the claims) and, optionally, PURITY_OPTIONS
  [package]         probe only the rows of this package; a token that matches nothing fails
  --json            print the verdict as JSON (no paths of this machine, no timing) instead of the report

  --help            print this text and exit`;

/** A usage error: nothing was probed. */
const USAGE_ERROR_CODE = 2;

interface IClaimsModule {
  PURITY_CLAIMS?: IPurityClaim[];
  PURITY_OPTIONS?: IPurityOptions;
}

interface IPurityArguments {
  claimsFile?: string;
  filter?: string;
  json: boolean;
}

const parsePurityArguments = (args: string[]): IPurityArguments | string => {
  const parsed: IPurityArguments = { json: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      parsed.json = true;
      continue;
    }

    if (arg === '--claims') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return '--claims needs a file';
      }

      parsed.claimsFile = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      return `unknown option "${arg}"`;
    }

    if (parsed.filter !== undefined) {
      return `unexpected argument "${arg}"`;
    }

    parsed.filter = arg;
  }

  return parsed;
};

/** `devz check <name>`: runs one of the shared repository gates in the current folder. */
export class CheckCommand {
  static async run(opts: { root: string; args?: string[] }): Promise<number> {
    const { root, args = [] } = opts;
    const [name, ...rest] = args;

    if (name === undefined || name === '--help' || name === '-h') {
      console.log(USAGE);
      return name === undefined ? USAGE_ERROR_CODE : 0;
    }

    if (name !== 'purity') {
      console.error(`devz check: unknown check "${name}"\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    if (rest.includes('--help') || rest.includes('-h')) {
      console.log(USAGE);
      return 0;
    }

    const parsed = parsePurityArguments(rest);
    if (typeof parsed === 'string') {
      console.error(`devz check purity: ${parsed}\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    if (parsed.claimsFile === undefined) {
      console.error(`devz check purity: --claims <file> is required\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const claimsPath = isAbsolute(parsed.claimsFile)
      ? parsed.claimsFile
      : resolve(root, parsed.claimsFile);
    if (!existsSync(claimsPath)) {
      console.error(`devz check purity: claims file not found: ${parsed.claimsFile}`);
      return USAGE_ERROR_CODE;
    }

    const claimsModule: IClaimsModule = await import(claimsPath);
    if (!Array.isArray(claimsModule.PURITY_CLAIMS)) {
      console.error(`devz check purity: ${parsed.claimsFile} does not export PURITY_CLAIMS`);
      return USAGE_ERROR_CODE;
    }

    const lines: string[] = [];
    const report = await checkPurity({
      root,
      claims: claimsModule.PURITY_CLAIMS,
      options: claimsModule.PURITY_OPTIONS,
      filter: parsed.filter,
      claimsFile: relative(root, claimsPath),
      print: (line) => (parsed.json ? lines.push(line) : console.log(line)),
      printError: (line) => console.error(line),
    });

    if (report === undefined) {
      return 1;
    }

    if (parsed.json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report.failed > 0 ? 1 : 0;
  }
}
