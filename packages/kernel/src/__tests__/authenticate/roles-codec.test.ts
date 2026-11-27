import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { AuthenticationFieldCodecs } from '@/base/auth/authenticate/common/codecs';

describe('ROLES_CODEC - a field that is no role list', () => {
  for (const raw of ['{}', '[1]', '["a"]', '"a|b|1"']) {
    test(`${raw} is refused as unauthorized`, () => {
      let caught: unknown;

      try {
        AuthenticationFieldCodecs.ROLES_CODEC.deserialize({ raw });
      } catch (error) {
        caught = error;
      }

      expect(isApplicationError(caught) && caught.statusCode).toBe(401);
      expect(String(caught)).toContain('not a list of id|identifier|priority strings');
    });
  }
});
