import type { IFetchRequestContext } from './types';

/** The request a hook sees, frozen so that its url, method and attempt cannot be assigned: only the headers are for the hook to change. */
export class FetchRequestContext implements IFetchRequestContext {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly attempt: number;

  constructor(opts: { method: string; url: string; headers: Headers; attempt: number }) {
    this.method = opts.method;
    this.url = opts.url;
    this.headers = opts.headers;
    this.attempt = opts.attempt;

    Object.freeze(this);
  }
}
