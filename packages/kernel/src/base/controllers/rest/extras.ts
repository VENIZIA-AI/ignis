import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * A figure a list route offers beside its rows:
 * - a function runs when the client names it;
 * - `{ isDefault: true, compute }` always runs, unless the client switches it off with `-name`;
 * - `{ keys, compute }` is a group - the client names the keys it wants (`facets(status,tag)`), and
 *   `compute` receives exactly those, so one aggregate pass serves them all.
 */
export type TResponseExtra =
  | (() => ValueOrPromise<unknown>)
  | { isDefault: boolean; compute: () => ValueOrPromise<unknown>; keys?: never }
  | {
      keys: ReadonlyArray<string>;
      compute: (opts: { keys: Array<string> }) => ValueOrPromise<unknown>;
      isDefault?: never;
    };

/** One entry of `x-request-extra`: `name`, `-name` (a default switched off), `-*` (every default off) or `name(key,key)`. */
export interface IRequestedExtra {
  name: string;
  isExcluded: boolean;
  keys?: Array<string>;
}

/** A name or a key: letters, digits, `_`, `.` and `-` inside. Anything else is refused, never evaluated. */
const IDENTIFIER = /^[A-Za-z_][\w.-]*$/;
const ENTRY = /^(-?)([^()\s]+)(?:\(([^()]*)\))?$/;

/** `-*`: every default off - for a read that wants the rows alone. */
const ALL_DEFAULTS = '*';

/** Parses `x-request-extra` and resolves it against what a route offers. */
export class ResponseExtras {
  /** The entries of the header, in the order written. Malformed input is a 400 naming it. */
  static parse(opts: { header?: string | null }): Array<IRequestedExtra> {
    const header = opts.header?.trim() ?? '';
    if (header === '') {
      return [];
    }

    const entries: Array<IRequestedExtra> = [];
    for (const raw of ResponseExtras.splitTopLevel({ header })) {
      const match = raw.trim().match(ENTRY);
      const name = match?.[2];

      const isAllDefaultsOff =
        match?.[1] === '-' && name === ALL_DEFAULTS && match[3] === undefined;
      if (!match || !name || (!isAllDefaultsOff && !IDENTIFIER.test(name))) {
        throw ResponseExtras.badRequest({ message: `Malformed extra '${raw.trim()}'` });
      }

      const keys =
        match[3] === undefined
          ? undefined
          : match[3]
              .split(',')
              .map(key => key.trim())
              .filter(key => key.length > 0);

      if (keys?.some(key => !IDENTIFIER.test(key))) {
        throw ResponseExtras.badRequest({ message: `Malformed key in extra '${raw.trim()}'` });
      }

      entries.push({ name, isExcluded: match[1] === '-', keys });
    }

    return entries;
  }

  /**
   * What to compute: the asked-for extras and the defaults, minus the ones switched off - each with the
   * keys asked for, de-duplicated in the order asked. Every name and key is checked against `offered`.
   */
  static resolve(opts: {
    requested: Array<IRequestedExtra>;
    offered: Record<string, TResponseExtra>;
  }): Map<string, Array<string> | undefined> {
    const { requested, offered } = opts;
    const offeredNames = Object.keys(offered).join(', ') || 'none';
    const plan = new Map<string, Array<string> | undefined>();
    const excluded = new Set<string>();

    let isEveryDefaultOff = false;

    for (const entry of requested) {
      if (entry.isExcluded && entry.name === ALL_DEFAULTS) {
        isEveryDefaultOff = true;
        continue;
      }

      if (!Object.hasOwn(offered, entry.name)) {
        throw ResponseExtras.badRequest({
          message: `Unknown extra requested: ${entry.name} | This route offers: ${offeredNames}`,
        });
      }

      if (entry.isExcluded) {
        if (entry.keys !== undefined) {
          throw ResponseExtras.badRequest({
            message: `Switching '${entry.name}' off takes no keys`,
          });
        }

        excluded.add(entry.name);
        continue;
      }

      const definition = offered[entry.name];
      const isGroup = typeof definition !== 'function' && definition.keys !== undefined;

      if (!isGroup) {
        if (entry.keys !== undefined) {
          throw ResponseExtras.badRequest({ message: `Extra '${entry.name}' takes no keys` });
        }

        plan.set(entry.name, undefined);
        continue;
      }

      if (!entry.keys?.length) {
        throw ResponseExtras.badRequest({
          message: `Extra '${entry.name}' needs keys: ${definition.keys.join(', ')} | Name them as ${entry.name}(key,key)`,
        });
      }

      const unknown = entry.keys.filter(key => !definition.keys.includes(key));
      if (unknown.length > 0) {
        throw ResponseExtras.badRequest({
          message: `Unknown key for extra '${entry.name}': ${unknown.join(', ')} | It offers: ${definition.keys.join(', ')}`,
        });
      }

      plan.set(entry.name, [...new Set([...(plan.get(entry.name) ?? []), ...entry.keys])]);
    }

    for (const [name, definition] of Object.entries(offered)) {
      // A group needs keys, so it never runs unasked, whatever its declaration claims.
      const isDefault =
        typeof definition !== 'function' &&
        definition.keys === undefined &&
        definition.isDefault === true;
      if (isDefault && !isEveryDefaultOff && !plan.has(name)) {
        plan.set(name, undefined);
      }
    }

    for (const name of excluded) {
      plan.delete(name);
    }

    return plan;
  }

  /** Runs the plan in parallel; each value under its name. */
  static async compute(opts: {
    plan: Map<string, Array<string> | undefined>;
    offered: Record<string, TResponseExtra>;
  }): Promise<Record<string, unknown>> {
    const { plan, offered } = opts;
    const names = [...plan.keys()];

    // Async, so an extra that throws synchronously becomes a rejection Promise.all owns, never an
    // unhandled one left behind by a sibling already running.
    const values = await Promise.all(
      names.map(async name => {
        const definition = offered[name];

        if (typeof definition === 'function') {
          return definition();
        }

        if (definition.keys !== undefined) {
          return definition.compute({ keys: plan.get(name) ?? [] });
        }

        return definition.compute();
      }),
    );

    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  }

  /** Commas inside `( )` belong to the keys, not to the list of extras. */
  private static splitTopLevel(opts: { header: string }): Array<string> {
    const parts: Array<string> = [];
    let depth = 0;
    let current = '';

    for (const character of opts.header) {
      if (character === '(') {
        depth++;
      } else if (character === ')') {
        depth--;
      }

      if (character === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    parts.push(current);
    return parts.filter(part => part.trim().length > 0);
  }

  private static badRequest(opts: { message: string }) {
    return getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[x-request-extra] ${opts.message}`,
    });
  }
}
