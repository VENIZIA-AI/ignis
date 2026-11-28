import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { useRequestContext } from '@venizia/ignis';
import { LoggerFactory } from '@venizia/ignis-helpers';

/**
 * Logs each RPC with its outcome, duration and request id. Messages and error texts are not logged: they may hold what
 * a user typed.
 */
export class RpcLogInterceptor {
  static create(): Interceptor {
    return (next) => async (request) => {
      const startedAt = performance.now();
      const rpc = `${request.service.typeName}/${request.method.name}`;
      const requestId: unknown = useRequestContext()?.get('requestId');

      const done = (opts: { outcome: string }) => {
        LoggerFactory.getLogger(['rpc']).info(
          'RPC | %s | outcome: %s | took: %s ms | requestId: %s',
          rpc,
          opts.outcome,
          Math.round(performance.now() - startedAt),
          requestId,
        );
      };

      try {
        const response = await next(request);

        if (response.stream) {
          return {
            ...response,
            message: RpcLogInterceptor.observe({ source: response.message, done }),
          };
        }

        done({ outcome: 'ok' });

        return response;
      } catch (error) {
        done({ outcome: RpcLogInterceptor.outcomeOf({ error }) });
        throw error;
      }
    };
  }

  /** A streamed answer ends later than the call to `next`: it is logged when its last message went out. */
  private static async *observe<Message>(opts: {
    source: AsyncIterable<Message>;
    done: (opts: { outcome: string }) => void;
  }) {
    let outcome = 'closed';

    try {
      yield* opts.source;
      outcome = 'ok';
    } catch (error) {
      outcome = RpcLogInterceptor.outcomeOf({ error });
      throw error;
    } finally {
      opts.done({ outcome });
    }
  }

  private static outcomeOf(opts: { error: unknown }) {
    return Code[ConnectError.from(opts.error).code];
  }
}
