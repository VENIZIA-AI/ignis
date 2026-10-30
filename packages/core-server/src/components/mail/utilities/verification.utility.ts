export class MailVerificationUtility {
  static getExpiryTime(opts: { minutes: number }): Date {
    return new Date(Date.now() + opts.minutes * 60 * 1000);
  }

  static getExpiryTimeInHours(opts: { hours: number }): Date {
    return new Date(Date.now() + opts.hours * 60 * 60 * 1000);
  }
}

/** @deprecated Use `MailVerificationUtility.getExpiryTime({ minutes })`. Removed in 0.5. */
export function getExpiryTime(minutes: number): Date {
  return MailVerificationUtility.getExpiryTime({ minutes });
}

/** @deprecated Use `MailVerificationUtility.getExpiryTimeInHours({ hours })`. Removed in 0.5. */
export function getExpiryTimeInHours(hours: number): Date {
  return MailVerificationUtility.getExpiryTimeInHours({ hours });
}
