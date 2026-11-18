import { BindingKeys } from '@venizia/ignis-inversion';
import type { IApiReferenceOptions } from './types';

/** Container keys of the API reference component. */
export class ApiReferenceBindingKeys {
  static readonly API_REFERENCE_OPTIONS = BindingKeys.build<IApiReferenceOptions>({
    key: '@app/api-reference/options',
  });
}
