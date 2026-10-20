import { BaseHelper } from '../base';
import { UuidHelper } from './uuid';

/**
 * The correlation id every IGNIS host stamps on a request, so a server, a browser Worker and the
 * page calling it cannot drift into different formats. A UUID version 4 - random, no clock to
 * correlate a caller by - drawn through {@link UuidHelper}.
 *
 * Never `crypto.randomUUID()` on its own, which is `hono/request-id`'s default: browsers gate that
 * one API on a SECURE CONTEXT. Measured in Chrome - on `http://<lan-ip>` both the page and a Worker
 * report `crypto` present and `getRandomValues` working, while `randomUUID` and `subtle` are
 * `undefined` and the call throws `TypeError`. On `http://localhost` (a secure origin) all four are
 * there. So the gate follows the ORIGIN, not the worker: testing from a phone over the LAN is
 * enough to lose it. `UuidHelper.v4()` rebuilds the identical shape from `getRandomValues`, which
 * carries no such gate - a log pipeline cannot tell the two paths apart.
 */
export class RequestIdGenerator extends BaseHelper {
  private readonly uuid = UuidHelper.getInstance();

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? RequestIdGenerator.name });
  }

  nextId(): string {
    return this.uuid.v4();
  }
}
