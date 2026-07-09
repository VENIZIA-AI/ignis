import { int } from '@venizia/ignis-helpers';
import type { IJWTTokenPayload, IPayloadFieldCodec } from './types';

export class AuthenticationFieldCodecs {
  static readonly ROLES_CODEC: IPayloadFieldCodec<IJWTTokenPayload['roles']> = {
    key: 'roles',
    serialize(opts) {
      return JSON.stringify(opts.value.map(el => `${el.id}|${el.identifier}|${el.priority}`));
    },
    deserialize(opts) {
      return (JSON.parse(opts.raw) as string[]).map(el => {
        const [id, identifier, priority] = el.split('|');
        return { id, identifier, priority: int(priority) };
      });
    },
  };

  /** Builds a single payload field codec. */
  static build<T = unknown>(opts: {
    key: string;
    serialize: IPayloadFieldCodec<T>['serialize'];
    deserialize: IPayloadFieldCodec<T>['deserialize'];
  }): IPayloadFieldCodec<T> {
    return {
      key: opts.key,
      serialize: opts.serialize,
      deserialize: opts.deserialize,
    };
  }
}
