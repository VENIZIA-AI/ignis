import { ParseUtility } from '@venizia/ignis-helpers/core';
import type { IPayloadFieldCodec, TJWTTokenRole } from './types';

/** Ready-made payload field codecs, plus `build` to define one. A codec turns one JWT payload field into a string and back so it can ride through the encrypted payload envelope. */
export class AuthenticationFieldCodecs {
  static readonly ROLES_CODEC: IPayloadFieldCodec<TJWTTokenRole[]> = {
    key: 'roles',
    serialize(opts) {
      return JSON.stringify(opts.value.map((el) => `${el.id}|${el.identifier}|${el.priority}`));
    },
    deserialize(opts) {
      return (JSON.parse(opts.raw) as string[]).map((el) => {
        const [id, identifier, priority] = el.split('|');

        return { id, identifier, priority: ParseUtility.toInt({ input: priority }) };
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
