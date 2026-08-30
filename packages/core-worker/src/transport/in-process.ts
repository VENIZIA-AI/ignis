import { BaseHelper, RequestIdGenerator } from '@venizia/ignis-helpers/core';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffResponseEnvelope } from '@/envelope/types';
import type { IBffTransport } from './common/types';

/**
 * No worker, no browser - the seam that makes a BFF testable in-process. It still runs the full
 * envelope round trip, and that is the whole point: a bare pass-through lets a route pass here and
 * hang over a real Worker, because only the envelope applies the synthetic origin, buffers a
 * streaming body, and reduces a thrown error to `{ text, code, args }`. A test is worth what its
 * differences from production are worth.
 *
 * What it deliberately does NOT mirror is the timeout: in-process there is no message that can be
 * lost, so a handler either settles or the caller's own test timeout fires.
 */
export class InProcessBffTransport extends BaseHelper implements IBffTransport {
  private readonly handler: (request: Request) => Promise<Response>;
  private readonly requestIdGenerator = new RequestIdGenerator({
    scope: InProcessBffTransport.name,
  });

  constructor(opts: { handler: (request: Request) => Promise<Response> }) {
    super({ scope: InProcessBffTransport.name });

    this.handler = opts.handler;
  }

  async fetch(opts: { request: Request }): Promise<Response> {
    const id = this.requestIdGenerator.nextId();

    const requestEnvelope = await BffEnvelope.encodeRequest({
      request: opts.request,
      id,
      url: BffEnvelope.toSyntheticUrl({ url: opts.request.url }),
    });

    let responseEnvelope: IBffResponseEnvelope;

    try {
      const response = await this.handler(BffEnvelope.decodeRequest({ envelope: requestEnvelope }));
      responseEnvelope = await BffEnvelope.encodeResponse({ response, id });
    } catch (error) {
      this.logger.for(this.fetch.name).error('Handler failed | id: %s | error: %s', id, error);

      // Encoded and decoded rather than rethrown: what a UI receives over a real Worker is a
      // rebuilt `ApplicationError` carrying only the normalised shape - never the original object,
      // its stack or its `extra`.
      throw BffEnvelope.decodeError({ envelope: BffEnvelope.encodeError({ id, error }) });
    }

    return BffEnvelope.decodeResponse({ envelope: responseEnvelope });
  }
}
