import { BaseHelper } from '../base';
import { SnowflakeUidHelper } from './helper';

/**
 * The correlation id every IGNIS host stamps on a request, so a server, a browser Worker and the
 * page calling it cannot drift into different formats.
 *
 * Never `crypto.randomUUID()`, which is `hono/request-id`'s own default: browsers expose it only in
 * a SECURE CONTEXT, so on plain http it is `undefined` and the call throws.
 *
 * The fallback matters because `nextId()` refuses a backwards clock jump over 100ms, which a
 * sleeping/resuming tab really sees - a correlation token should degrade, not fail the request.
 */
export class RequestIdGenerator extends BaseHelper {
  private readonly snowflake: SnowflakeUidHelper;
  private fallbackSequence = 0;

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? RequestIdGenerator.name });
    this.snowflake = new SnowflakeUidHelper();
  }

  nextId(): string {
    try {
      return this.snowflake.nextId();
    } catch (error) {
      this.fallbackSequence += 1;

      this.logger
        .for(this.nextId.name)
        .warn(
          'Snowflake refused to generate a request id, falling back | error: %s',
          error instanceof Error ? error.message : String(error),
        );

      return `fallback-${Date.now()}-${this.fallbackSequence}`;
    }
  }
}
