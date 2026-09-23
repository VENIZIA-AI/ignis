/**
 * The keys the user-audit and timestamp enrichers build: the user from the request context, the
 * times from the clock. Internal: the `common` barrel does not export this file.
 */
export class AuditFields {
  static readonly CREATED_BY = 'createdBy';
  static readonly MODIFIED_BY = 'modifiedBy';
  static readonly CREATED_AT = 'createdAt';
  static readonly MODIFIED_AT = 'modifiedAt';

  static readonly SCHEME_SET = new Set<string>([
    this.CREATED_BY,
    this.MODIFIED_BY,
    this.CREATED_AT,
    this.MODIFIED_AT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
