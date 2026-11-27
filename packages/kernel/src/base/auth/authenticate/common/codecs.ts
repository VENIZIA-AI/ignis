import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, ParseUtility } from '@venizia/ignis-helpers/core';
import type { IPayloadFieldCodec, TJWTTokenRole } from './types';

/** Ready-made payload field codecs, plus `build` to define one. A codec turns one JWT payload field into a string and back so it can ride through the encrypted payload envelope. */
export class AuthenticationFieldCodecs {
  static readonly ROLES_CODEC: IPayloadFieldCodec<TJWTTokenRole[]> = {
    key: 'roles',
    serialize(opts) {
      return JSON.stringify(opts.value.map((el) => `${el.id}|${el.identifier}|${el.priority}`));
    },
    deserialize(opts) {
      const roles: unknown = JSON.parse(opts.raw);
      const refuse = () =>
        getError({
          statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
          message: '[ROLES_CODEC] The roles field is not a list of id|identifier|priority strings',
        });

      if (!Array.isArray(roles)) {
        throw refuse();
      }

      return roles.map((role) => {
        const parts = typeof role === 'string' ? role.split('|') : [];

        if (parts.length < 3) {
          throw refuse();
        }

        const [id, identifier, priority] = parts;

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
