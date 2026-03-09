import type { IAuthorizationComparable } from '../../common';

export class StringAuthorizationResource implements IAuthorizationComparable<string> {
  readonly value: string;

  static build(opts: { value: string }): StringAuthorizationResource {
    return new StringAuthorizationResource(opts);
  }

  constructor(opts: { value: string }) {
    this.value = opts.value;
  }

  compare(other: string) {
    return this.value.localeCompare(other);
  }

  isEqual(other: string): boolean {
    return this.compare(other) === 0;
  }
}
