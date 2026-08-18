import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn's own helper: `clsx` resolves conditionals, `twMerge` drops the Tailwind class that lost. */
export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};
