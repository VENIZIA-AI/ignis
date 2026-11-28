import { ClassRenamesCommand, type IClassRename } from './class-renames';

const USAGE = `Usage: devz codemod execution-class [paths...] [--write [--all] | --check] [--reverse]

PromiseUtility (@venizia/ignis-helpers, @venizia/ignis) becomes Execution, and two of its methods are renamed:
executeWithLimit is withLimit, voidExecution is fireAndForget. sleep and withTimeout keep their names.

It reads TypeScript files as "devz codemod class-renames" does: named, aliased, type and namespace imports, and
re-exports. A file that already declares a name "Execution" gets the import aliased to "IgnisExecution". A method
taken apart ("const { voidExecution } = PromiseUtility") is not renamed: your typecheck reports it.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --reverse  rename back, for a downgrade
  --help     print this text and exit`;

/** The rename of the promise utilities into `Execution`. */
export class ExecutionClassTable {
  static readonly ROWS: ReadonlyArray<IClassRename> = [
    {
      oldName: 'PromiseUtility',
      newName: 'Execution',
      packages: ['@venizia/ignis-helpers', '@venizia/ignis'],
      members: { executeWithLimit: 'withLimit', voidExecution: 'fireAndForget' },
    },
  ];
}

/** `devz codemod execution-class`: `PromiseUtility` to `Execution`. */
export class ExecutionClassCommand {
  static readonly USAGE = USAGE;

  static run(opts: { root: string; args: string[] }): Promise<number> {
    return ClassRenamesCommand.run({
      ...opts,
      codemod: ClassRenamesCommand.ofRows({
        name: 'execution-class',
        usage: USAGE,
        rows: ExecutionClassTable.ROWS,
      }),
    });
  }
}
