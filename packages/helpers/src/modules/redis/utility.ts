import { HTTP } from '@/common';
import { getError } from '@/modules/error';
import type { Logger } from '@/modules/logger';
import { voidExecution } from '@/utilities/promise.utility';
import { EventEmitter } from 'node:events';
import type { TRedisClient } from './common';

const REDIS_READY_TIMEOUT = 30_000;

/**
 * Resolves once the client reaches the `ready` state. Rejects on the first client error, or when
 * `timeoutMs` elapses - a client that never reaches `ready` must not hang the caller forever.
 */
export const waitForRedisReady = (opts: {
  client: TRedisClient;
  timeoutMs?: number;
}): Promise<void> => {
  const { client, timeoutMs = REDIS_READY_TIMEOUT } = opts;

  return new Promise<void>((resolve, reject) => {
    if (client.status === 'ready') {
      resolve();
      return;
    }

    const emitter = client as EventEmitter;

    /**
     * Every terminal branch runs these. The clients are long-lived and each `configure()` calls this
     * again, so a listener left bound accumulates until EventEmitter warns about a leak - and a
     * later 'error' would fire a handler whose promise has already settled.
     */
    const cleanups: Array<() => void> = [];
    const detach = () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };

    const onReady = () => {
      detach();
      resolve();
    };

    const onError = (error: Error) => {
      detach();
      reject(error);
    };

    const timer = setTimeout(() => {
      detach();
      reject(
        getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `Redis client did not become ready within ${timeoutMs}ms (status: ${client.status})`,
        }),
      );
    }, timeoutMs);

    cleanups.push(
      () => clearTimeout(timer),
      () => emitter.removeListener('ready', onReady),
      () => emitter.removeListener('error', onError),
    );

    emitter.once('ready', onReady);
    emitter.once('error', onError);
  });
};

/**
 * Kicks off connection for clients still parked in `wait` - duplicated clients inherit
 * `lazyConnect` from their parent and never dial on their own.
 */
export const ensureRedisClientsConnecting = (opts: {
  clients: TRedisClient[];
  logger?: Logger;
  scope: string;
}): void => {
  const { clients, logger, scope } = opts;

  for (const client of clients) {
    if (client.status !== 'wait') {
      continue;
    }

    voidExecution({ logger, scope, execution: client.connect() });
  }
};
