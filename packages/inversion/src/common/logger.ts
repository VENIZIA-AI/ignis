export class Logger {
  private static debugEnabled = Boolean(globalThis.process?.env?.DEBUG);

  static enableDebug(opts: { enabled: boolean }) {
    Logger.debugEnabled = opts.enabled;
  }

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
    if (!Logger.debugEnabled) {
      return;
    }

    console.log(`[DEBUG] ${message}`, ...args);
  }
}
