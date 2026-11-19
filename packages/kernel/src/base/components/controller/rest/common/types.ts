import { BindingKeys } from '@/helpers/inversion';

/** Options of the REST component. Currently has no keys. */
export interface IRestComponentConfig {}

/** Binding keys of the REST component. */
export class RestBindingKeys {
  /** Untyped on purpose: `IRestComponentConfig` has no fields, so a type would check nothing. */
  static readonly REST_COMPONENT_OPTIONS = BindingKeys.build<unknown>({ key: '@app/rest/options' });
}
