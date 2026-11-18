import { BindingKeys } from '@venizia/ignis-inversion';
import type { IServerInfoOptions } from './types';

/** Container keys of the server info component. */
export class ServerInfoBindingKeys {
  static readonly SERVER_INFO_OPTIONS = BindingKeys.build<IServerInfoOptions>({
    key: '@app/server-info/options',
  });
}
