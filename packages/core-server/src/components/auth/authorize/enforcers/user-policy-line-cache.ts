import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { TNullable } from '@venizia/ignis-helpers/common';
import {
  AuthorizationErrors,
  type IAuthorizationUser,
  type ICasbinEnforcerCachedRedis,
} from '@venizia/ignis-kernel';

/** Computes a user's policy lines on a cache miss - CasbinAuthorizationEnforcer wires this to its isolated-enforcer extraction (PolicyLineCodec.extractUserLines). */
export type TPolicyLineLoader = (opts: { user: IAuthorizationUser }) => Promise<string[]>;

/**
 * Per-user redis cache of casbin policy lines. Owns the cache key, the TTL, and concurrent-miss
 * de-duplication so N simultaneous misses for the same user collapse onto one extraction.
 */
export class UserPolicyLineCache extends BaseHelper {
  private readonly cached: ICasbinEnforcerCachedRedis & { use: true };
  private readonly loadLines: TPolicyLineLoader;

  // cacheKey -> in-progress line-fetch; concurrent misses for the same user share one extraction instead of all hitting the DB (see fetch()).
  private readonly pendingLineFetches = new Map<string, Promise<string[]>>();

  constructor(opts: {
    cached: ICasbinEnforcerCachedRedis & { use: true };
    loadLines: TPolicyLineLoader;
  }) {
    super({ scope: UserPolicyLineCache.name });
    this.cached = opts.cached;
    this.loadLines = opts.loadLines;
  }

  /** Fetch the user's lines, collapsing concurrent misses per key onto one extraction. Best-effort: two misses may race past the cache read and both extract (benign - per-user lines are identical). */
  async fetch(opts: { user: IAuthorizationUser }): Promise<string[]> {
    const cacheKey = await this.resolveCacheKey({ user: opts.user });

    // Cache hit - Redis owns expiry (PX on write), so a present key is fresh; a corrupted/legacy entry must NOT 500 the request, so it is discarded and refetched.
    const raw = await this.cached.options.connection.get({ key: cacheKey });
    if (raw) {
      const lines = this.parseLines({ raw, cacheKey });

      if (lines) {
        return lines;
      }
    }

    const existing = this.pendingLineFetches.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Cache miss (or discarded corrupt entry) - extract from an ISOLATED enforcer so a concurrent load cannot contaminate the cache, persist it, then return the lines for THIS request.
    const task = async () => {
      const lines = await this.loadLines({ user: opts.user });
      await this.writeLines({ cacheKey, lines });
      return lines;
    };

    const promise = task().finally(() => {
      this.pendingLineFetches.delete(cacheKey);
    });

    this.pendingLineFetches.set(cacheKey, promise);
    return promise;
  }

  /** Drop the user's cached entry. */
  async invalidate(opts: {
    user: IAuthorizationUser;
  }): Promise<{ cacheKey: string; invalidatedKeys: number }> {
    const cacheKey = await this.resolveCacheKey({ user: opts.user });
    const invalidatedKeys = await this.cached.options.connection.del({ keys: [cacheKey] });

    return { cacheKey, invalidatedKeys };
  }

  /** Drop then recompute the user's cached entry via `loadLines` - an isolated extraction (never a pooled serving enforcer), so a concurrent request cannot make the cache hold another user's lines. */
  async rebuild(opts: {
    user: IAuthorizationUser;
  }): Promise<{ cacheKey: string; lines: string[] }> {
    const cacheKey = await this.resolveCacheKey({ user: opts.user });
    await this.cached.options.connection.del({ keys: [cacheKey] });

    const lines = await this.loadLines({ user: opts.user });
    await this.writeLines({ cacheKey, lines });

    return { cacheKey, lines };
  }

  /** Compute the user's cache key and reject an empty result - consistent with the read path. */
  private async resolveCacheKey(opts: { user: IAuthorizationUser }): Promise<string> {
    const cacheKey = await this.cached.options.keyFn({ user: opts.user });
    if (!cacheKey) {
      throw getError({
        error: AuthorizationErrors.CACHE_KEY_INVALID,
        message: '[UserPolicyLineCache] keyFn returned an empty cache key.',
      });
    }

    return cacheKey;
  }

  /** Single source of truth for the cache encoding. Used by the miss path and rebuild(). */
  private async writeLines(opts: { cacheKey: string; lines: string[] }): Promise<void> {
    await this.cached.options.connection.set({
      key: opts.cacheKey,
      value: opts.lines,
      options: { expiresIn: this.cached.options.expiresIn },
    });
  }

  /** Decode cached policy lines; on any corruption, log and return null so the caller refetches. */
  private parseLines(opts: { raw: string; cacheKey: string }): TNullable<string[]> {
    try {
      const parsed = JSON.parse(opts.raw);

      if (!Array.isArray(parsed) || parsed.some(line => typeof line !== 'string')) {
        throw getError({
          message: '[UserPolicyLineCache] Cached payload is not an array of policy lines.',
        });
      }

      return parsed as string[];
    } catch (error) {
      this.logger
        .for(this.parseLines.name)
        .warn('Discarding corrupted authz cache entry | key: %s | error: %s', opts.cacheKey, error);
      return null;
    }
  }
}
