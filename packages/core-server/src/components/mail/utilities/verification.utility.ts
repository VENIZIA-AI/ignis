export class MailVerificationUtility {
  static getExpiryTime(opts: { minutes: number }): Date {
    return new Date(Date.now() + opts.minutes * 60 * 1000);
  }

  static getExpiryTimeInHours(opts: { hours: number }): Date {
    return new Date(Date.now() + opts.hours * 60 * 60 * 1000);
  }
}
