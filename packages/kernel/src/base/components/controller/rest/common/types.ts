import { BindingKeys } from '@/helpers/inversion';

/** Options of the REST component. Currently has no keys. */
export interface IRestComponentConfig {}

/** Binding keys of the REST component. */
export class RestBindingKeys {
  static readonly REST_COMPONENT_OPTIONS = BindingKeys.build<IRestComponentConfig>({
    key: '@app/rest/options',
  });
}
