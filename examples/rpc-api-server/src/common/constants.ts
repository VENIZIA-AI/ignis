export class App {
  static readonly APPLICATION_NAME = process.env.APP_ENV_APPLICATION_NAME;

  static readonly TIMEZONE =
    process.env.APP_ENV_APPLICATION_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
  static readonly TIME_OFFSET = '+07:00';

  static readonly SECRET = process.env.APP_ENV_APPLICATION_SECRET ?? 'ApPlicAti0n.SreT';

  static readonly DEFAULT_LOCALE = 'en_US';
  static readonly DEFAULT_LOCALE_ENCODE = 'en.UTF-8';
  static readonly DEFAULT_EXPLORER_PATH = '/explorer';
}

export class ApplicationRoles {
  static readonly API = 'api';
}
