/** Base for classes that carry a logging `scope` and an optional `identifier`; both default to `''` when omitted. */
export class BaseHelper {
  scope: string;
  identifier: string;

  constructor(opts: { scope: string; identifier?: string }) {
    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }
}
