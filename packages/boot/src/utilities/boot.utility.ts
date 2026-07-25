import { AnyType, getError, isClass, TClass } from '@venizia/ignis-helpers';
import { glob } from 'glob';

export const discoverFiles: (opts: {
  pattern: string;
  root: string;
}) => Promise<string[]> = async opts => {
  const { pattern, root } = opts;

  try {
    const discovered = await glob(pattern, { cwd: root, absolute: true });
    return discovered;
  } catch (error) {
    const errorMessage = (error as Error).message ?? 'Unknown error';
    throw getError({
      message: `Failed to discover files with pattern: ${pattern} | Error: ${errorMessage}`,
      cause: error,
    });
  }
};

const collectExportedClasses = (opts: { module: AnyType }): TClass<AnyType>[] => {
  const collected: TClass<AnyType>[] = [];

  for (const exported of Object.values(opts.module)) {
    if (!isClass(exported)) {
      continue;
    }

    collected.push(exported);
  }

  return collected;
};

export const loadClasses: (opts: { files: string[] }) => Promise<AnyType[]> = async opts => {
  const { files } = opts;
  const classes: TClass<AnyType>[] = [];

  for (const file of files) {
    try {
      const module = await import(file);
      classes.push(...collectExportedClasses({ module }));
    } catch (error) {
      const errorMessage = (error as Error).message ?? 'Unknown error';
      // Without the cause, the stack of the module that actually threw - the real diagnosis - is gone.
      throw getError({
        message: `Failed to load file: ${file} | Error: ${errorMessage}`,
        cause: error,
      });
    }
  }

  return classes;
};
