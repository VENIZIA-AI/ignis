/** Container binding keys for the authorize options, the always-allow roles, and (through `enforcerOptions`) the options of one named enforcer. */
export class AuthorizeBindingKeys {
  static readonly OPTIONS = '@app/authorize/options';
  static readonly ALWAYS_ALLOW_ROLES = '@app/authorize/always-allow-roles';

  static enforcerOptions(name: string): string {
    return `@app/authorize/enforcers/${name}/options`;
  }
}
