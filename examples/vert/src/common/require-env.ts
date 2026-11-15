import { applicationEnvironment, getError } from '@venizia/ignis-helpers';

/** A variable this app cannot start without: its value, or an error naming it. `get` answers `string | undefined`, so a required one is checked where it is read. */
export const requireEnv = (key: string): string => {
  const value = applicationEnvironment.get(key);

  if (value === undefined || value.trim() === '') {
    throw getError({ message: `[requireEnv] ${key} is not set` });
  }

  return value;
};
