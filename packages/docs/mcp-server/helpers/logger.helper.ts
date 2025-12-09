export class Logger {
  static info(message: string, ...args: unknown[]) {
    console.log(`[INFO] ${message}`, ...args);
  }

  static warn(message: string, ...args: unknown[]) {
    console.warn(`[WARN] ${message}`, ...args);
  }

  static error(message: string, ...args: unknown[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  static debug(message: string, ...args: unknown[]) {
    if (!process.env.DEBUG) {
      return;
    }

    console.log(`[DEBUG] ${message}`, ...args);
  }
}
