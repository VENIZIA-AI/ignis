/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The steps of an upgrade guide a reader has marked done, kept in that reader's browser (`localStorage`, one list per
 * project and version). Every read and write is guarded: a blocked or full storage, a private window, a value that is not a list of
 * names, and the guide still works, it just remembers nothing.
 */
const PREFIX = 'changelog-done:';

export const doneKey = (opts: { project: string; version: string }): string =>
  `${PREFIX}${opts.project}:${opts.version}`;

/** The browser's storage, or `undefined` when there is none or touching it throws. */
export const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const readDone = (opts: {
  storage: Storage | undefined;
  project: string;
  version: string;
}): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(
      opts.storage?.getItem(doneKey({ project: opts.project, version: opts.version })) ?? '[]',
    );

    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
};

export const writeDone = (opts: {
  storage: Storage | undefined;
  project: string;
  version: string;
  ids: Set<string>;
}): void => {
  try {
    opts.storage?.setItem(
      doneKey({ project: opts.project, version: opts.version }),
      JSON.stringify([...opts.ids]),
    );
  } catch {
    // nothing is remembered; the checkbox still works for this visit
  }
};
