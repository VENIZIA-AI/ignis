import { Authentication, useRequestContext } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** The signed-in user of the call being served, as `authenticate` stored it. */
export class CurrentUser {
  /** `undefined` outside a request, or before authentication. */
  static readId(): string | undefined {
    const user = useRequestContext()?.get(Authentication.CURRENT_USER);

    return user ? String(user.userId) : undefined;
  }

  static requireId(): string {
    const userId = CurrentUser.readId();

    if (!userId) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Sign in first',
      });
    }

    return userId;
  }
}
