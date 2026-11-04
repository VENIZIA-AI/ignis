import type { IAuthorizationRole } from '../common';

/** Role with a numeric priority. `identifier` is the zero-padded (3 digits) priority joined to the name by `delimiter`, e.g. `010_user`. */
export class AuthorizationRole implements IAuthorizationRole {
  readonly name: string;
  readonly priority: number;

  /**
   * Joins the padded priority to the name in `identifier`.
   *
   * @default '_'
   */
  readonly delimiter: string;

  static build(opts: { name: string; priority: number; delimiter?: string }): AuthorizationRole {
    return new AuthorizationRole(opts);
  }

  constructor(opts: { name: string; priority: number; delimiter?: string }) {
    this.name = opts.name;
    this.priority = opts.priority;
    this.delimiter = opts.delimiter ?? '_';
  }

  get identifier(): string {
    return [String(this.priority).padStart(3, '0'), this.name].join(this.delimiter);
  }

  compare(opts: { target: IAuthorizationRole }): number {
    return this.priority - opts.target.priority;
  }

  isHigherThan(opts: { target: IAuthorizationRole }): boolean {
    return this.compare(opts) > 0;
  }

  isLowerThan(opts: { target: IAuthorizationRole }): boolean {
    return this.compare(opts) < 0;
  }

  isEqualTo(opts: { target: IAuthorizationRole }): boolean {
    return this.compare(opts) === 0;
  }
}
