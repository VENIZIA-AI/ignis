import { AnyType, getError, TClass } from '@venizia/ignis-helpers';
import { glob } from 'glob';

/** Check if a value is a class constructor. */
export const isClass = <T>(target: AnyType): target is TClass<T> => {
  return typeof target === 'function' && target.prototype !== undefined;
};

/** Discover files matching a glob pattern. */
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
    });
  }
};

/** Load classes from discovered files via dynamic import. */
export const loadClasses: (opts: {
  files: string[];
  root: string;
}) => Promise<AnyType[]> = async opts => {
  const { files } = opts;
  const classes: TClass<AnyType>[] = [];

  for (const file of files) {
    try {
      const module = await import(file);
      for (const [_exportName, exported] of Object.entries(module)) {
        if (!isClass(exported)) {
          continue;
        }

        classes.push(exported);
      }
    } catch (error) {
      const errorMessage = (error as Error).message ?? 'Unknown error';
      throw getError({
        message: `Failed to load file: ${file} | Error: ${errorMessage}`,
      });
    }
  }

  return classes;
};
