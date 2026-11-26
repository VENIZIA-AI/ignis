import { format } from 'node:util';

/** What a `devz` command prints: its result on stdout, its warnings and errors on stderr, formatted as `console` does. */
export class CliOutput {
  static log(...parts: Array<unknown>): void {
    process.stdout.write(`${format(...parts)}\n`);
  }

  static warn(...parts: Array<unknown>): void {
    process.stderr.write(`${format(...parts)}\n`);
  }

  static error(...parts: Array<unknown>): void {
    process.stderr.write(`${format(...parts)}\n`);
  }
}
