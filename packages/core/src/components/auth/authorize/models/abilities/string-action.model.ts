import type { IAuthorizationComparable } from '../../common';

// --------------------------------------------------------------------------------------------------------
export class StringAuthorizationAction implements IAuthorizationComparable<string> {
  static readonly WILDCARD = '*';

  readonly value: string;

  static build(opts: { value: string }): StringAuthorizationAction {
    return new StringAuthorizationAction(opts);
  }

  constructor(opts: { value: string }) {
    this.value = opts.value;
  }

  compare(other: string) {
    if (this.value === StringAuthorizationAction.WILDCARD) {
      return 0;
    }
    return this.value.localeCompare(other);
  }

  isEqual(other: string): boolean {
    return this.compare(other) === 0;
  }
}
