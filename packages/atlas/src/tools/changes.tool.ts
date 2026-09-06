import { AtlasConstants } from '@/common';
import { RpcError, RpcErrorCodes } from '@/protocol/common';
import type { IToolHandler } from '@/protocol/common';
import { toPackageDirectory } from '@/releases';
import type { IChangelogRecord, ReleaseStore } from '@/releases';
import { z } from 'zod';
import { ChangesInputSchema, parseInput } from './common';

const DESCRIPTION =
  'List the changelog entries between two releases: a package with two of its versions, or no ' +
  'package with two `YYYY-MM-DD` dates. Every entry carries the id `get` reads it in full by.';

// Built once at module load - a guarded tool that re-resolves its store on every call never needs
// to rebuild this.
const INPUT_JSON_SCHEMA = z.toJSONSchema(ChangesInputSchema);

const KNOWN_VALUES_MAX = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Sorts below every real date, so a window with no lower bound opens before the first entry.
const OPEN_LOWER_BOUND = '';

/** One entry as the tool reports it - the store's record without the file name. */
interface IChangesEntry {
  id: string;
  date: string;
  title: string;
  kind: string | null;
  packages: string[];
}

interface IChangesResponse {
  package: string | null;
  from: string | null;
  to: string;
  entries: IChangesEntry[];
  truncated?: boolean;
}

/** The window one call asks for, in the terms the caller used and in the dates the store filters by. */
interface IWindow {
  package: string | null;
  from: string | null;
  to: string;
  fromDate: string;
  toDate: string;
}

const invalidParams = (message: string): RpcError =>
  new RpcError({ code: RpcErrorCodes.INVALID_PARAMS, message });

const listOf = (values: string[]): string => values.slice(0, KNOWN_VALUES_MAX).join(', ');

const unknownPackageError = (opts: { name: string; known: string[] }): RpcError =>
  invalidParams(`unknown package '${opts.name}'; known packages: ${listOf(opts.known)}`);

const unknownVersionError = (opts: {
  package: string;
  version: string;
  known: string[];
}): RpcError =>
  invalidParams(
    `unknown version '${opts.version}' for ${opts.package}; known versions: ${listOf(opts.known)}`,
  );

const notADateError = (opts: { field: string; value: string }): RpcError =>
  invalidParams(
    `${opts.field} must be a YYYY-MM-DD date when no package is given; got '${opts.value}'`,
  );

const entryOf = (record: IChangelogRecord): IChangesEntry => ({
  id: record.id,
  date: record.date,
  title: record.title,
  kind: record.kind,
  packages: record.packages,
});

/**
 * A package's window: `from` and `to` are its own versions, translated to the dates they shipped
 * on. `to` defaults to the newest release, `from` to the one before it - the newest release alone
 * when there is no earlier one.
 */
const packageWindowOf = (opts: {
  releases: ReleaseStore;
  package: string;
  from?: string;
  to?: string;
}): IWindow => {
  const name = toPackageDirectory(opts.package);
  const versions = opts.releases.versionsOf({ package: name });
  if (versions.length === 0) {
    throw unknownPackageError({ name: opts.package, known: opts.releases.packages() });
  }

  const to = opts.to ?? versions[0];
  if (!versions.includes(to)) {
    throw unknownVersionError({ package: name, version: to, known: versions });
  }

  // The default lower bound is the newest version released on an EARLIER day: several releases of
  // one package on one day are the norm here, and the version before `to` would answer nothing.
  const toDate = opts.releases.releaseDateOf({ package: name, version: to });
  const from =
    opts.from ??
    versions
      .slice(versions.indexOf(to) + 1)
      .find(
        candidate =>
          toDate === undefined ||
          (opts.releases.releaseDateOf({ package: name, version: candidate }) ?? '') < toDate,
      );
  if (from !== undefined && !versions.includes(from)) {
    throw unknownVersionError({ package: name, version: from, known: versions });
  }

  return {
    package: name,
    from: from ?? null,
    to,
    fromDate:
      from === undefined
        ? OPEN_LOWER_BOUND
        : (opts.releases.releaseDateOf({ package: name, version: from }) ?? OPEN_LOWER_BOUND),
    toDate: toDate ?? OPEN_LOWER_BOUND,
  };
};

/**
 * The whole-table window: `from` and `to` are dates. `to` defaults to the newest entry's date,
 * `from` to the newest date below it - so the default answer is the newest day of changes.
 */
const dateWindowOf = (opts: { releases: ReleaseStore; from?: string; to?: string }): IWindow => {
  const dates = opts.releases.entryDates();
  if (dates.length === 0) {
    throw invalidParams('no changelog entries in this build');
  }

  if (opts.to !== undefined && !DATE_PATTERN.test(opts.to)) {
    throw notADateError({ field: 'to', value: opts.to });
  }
  if (opts.from !== undefined && !DATE_PATTERN.test(opts.from)) {
    throw notADateError({ field: 'from', value: opts.from });
  }

  const to = opts.to ?? dates[0];
  const from = opts.from ?? dates.find(date => date < to);

  return {
    package: null,
    from: from ?? null,
    to,
    fromDate: from ?? OPEN_LOWER_BOUND,
    toDate: to,
  };
};

/** Drops the oldest entries until the reply fits, and says so - a trimmed page never looks whole. */
const withinBudget = (opts: { window: IWindow; entries: IChangesEntry[] }): IChangesResponse => {
  const base = {
    package: opts.window.package,
    from: opts.window.from,
    to: opts.window.to,
  };
  let entries = [...opts.entries];
  let response: IChangesResponse = { ...base, entries };
  const isOverBudget = (): boolean =>
    JSON.stringify(response).length > AtlasConstants.SEARCH_BUDGET_CHARS;

  while (isOverBudget() && entries.length > 0) {
    entries = entries.slice(0, -1);
    response = { ...base, entries, truncated: true };
  }

  return response;
};

export const buildChangesTool = (opts: { releases: ReleaseStore }): IToolHandler => ({
  definition: {
    name: 'changes',
    description: DESCRIPTION,
    inputSchema: INPUT_JSON_SCHEMA,
  },
  call: async ({ args }) => {
    const input = parseInput({ schema: ChangesInputSchema, args });

    if (opts.releases.isEmpty()) {
      throw invalidParams('no release table in this build');
    }

    const resolved =
      input.package === undefined
        ? dateWindowOf({ releases: opts.releases, from: input.from, to: input.to })
        : packageWindowOf({
            releases: opts.releases,
            package: input.package,
            from: input.from,
            to: input.to,
          });

    const found = opts.releases.entriesBetween({
      package: resolved.package ?? undefined,
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
    });

    return withinBudget({ window: resolved, entries: found.map(entryOf) });
  },
});
