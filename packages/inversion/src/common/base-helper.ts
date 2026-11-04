/** Base for classes that carry a logging `scope` and an optional `identifier`. */
export class BaseHelper {
  scope: string;

  /** @default '' */
  identifier: string;

  constructor(opts: { scope: string; identifier?: string }) {
    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }
}
