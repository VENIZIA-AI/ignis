import { getError } from '@/common/app-error';
import { TClass } from '@/common/types';
import { glob } from 'glob';

/**
 * Check if a value is a class constructor
 *
 * @param target - Target to check
 * @returns True if target is a class
 */
export const isClass = <T>(target: any): target is TClass<T> => {
  return typeof target === 'function' && target.prototype !== undefined;
};

/**
 * Discover files matching a glob pattern
 *
 * @param pattern - Glob pattern
 * @param root - Root directory
 * @returns Array of absolute file paths
 */
export const discoverFiles: (opts: {
  pattern: string;
  root: string;
}) => Promise<string[]> = async opts => {
  const { pattern, root } = opts;

  return new Promise<string[]>((resolve, reject) => {
    glob(pattern, { cwd: root, absolute: true }).then(resolve).catch(reject);
  });
};

/**
 * Load classes from files
 *
 * @param files - Array of file paths
 * @param root - Root directory (for relative paths in errors)
 * @returns Array of class constructors
 */
export const loadClasses: (opts: { files: string[] }) => Promise<any[]> = async opts => {
  const { files } = opts;
  const classes: TClass<any>[] = [];

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
      throw getError({
        message: `Failed to load file`,
      });
    }
  }

  return classes;
};
