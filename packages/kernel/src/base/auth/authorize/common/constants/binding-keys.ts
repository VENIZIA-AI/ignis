import { BindingKeys, type TBindingKey } from '@/helpers/inversion';
import type { IAuthorizeOptions } from '../types';

/** Container binding keys for the authorize options, the always-allow roles, and (through `enforcerOptions`) the options of one named enforcer. */
export class AuthorizeBindingKeys {
  static readonly OPTIONS = BindingKeys.build<IAuthorizeOptions>({ key: '@app/authorize/options' });
  static readonly ALWAYS_ALLOW_ROLES = BindingKeys.build<string[]>({
    key: '@app/authorize/always-allow-roles',
  });

  /** The options of the enforcer named `name`; their type is the enforcer's, so the caller names it: `enforcerOptions<ICasbinOptions>(name)`. */
  static enforcerOptions<T = unknown>(name: string): TBindingKey<T> {
    // A key built for `unknown` is the key of any `T`: the brand is bivariant.
    return BindingKeys.build<unknown>({ key: `@app/authorize/enforcers/${name}/options` });
  }
}
