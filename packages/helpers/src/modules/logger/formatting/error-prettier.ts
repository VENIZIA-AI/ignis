import { redactSecrets } from '@/common/redact';
import util from 'node:util';

/** Useful-only projection of an error: a driver's `query`/`params` repeat the message and are dropped. */
export interface IErrorSummary {
  name?: string;
  message?: string;
  code?: string | number;
  /** Frames ONLY - V8's `Error: <message>` header is stripped so the message is not repeated. */
  stack?: string;
  hint?: string;
  detail?: string;
  table?: string;
  constraint?: string;
  cause?: IErrorSummary;
}

/** Turns a thrown value into something a human can read in a console - log this, never the raw error. */
export class ErrorPrettier {
  /** Bounds a pathological or cyclic `cause` chain. */
  static readonly DEFAULT_MAX_CAUSE_DEPTH = 5;

  /** The throw site is near the top; the tail is identical framework plumbing for every request. */
  static readonly DEFAULT_MAX_STACK_FRAMES = 10;

  /** Driver diagnostics that are actionable and absent from `message` - `pg` supplies all four. */
  private static readonly DIAGNOSTIC_KEYS = ['hint', 'detail', 'table', 'constraint'] as const;

  /** A stack frame line in every V8 stack: `    at fn (file:line:col)`. */
  private static readonly FRAME_PATTERN = /^\s+at /;

  private static readonly INSPECT_OPTIONS: util.InspectOptions = {
    depth: 5,
    maxArrayLength: null,
    maxStringLength: null,
    breakLength: Infinity,
  };

  private static extractFrames(opts: { stack: unknown; maxFrames: number }): string | undefined {
    const { stack, maxFrames } = opts;

    if (typeof stack !== 'string') {
      return undefined;
    }

    const frames: Array<string> = [];

    // Hand-rolled over split+filter+slice: it stops at maxFrames instead of walking the whole stack.
    for (const line of stack.split('\n')) {
      if (!this.FRAME_PATTERN.test(line)) {
        continue;
      }

      frames.push(line);

      if (frames.length === maxFrames) {
        break;
      }
    }

    // Emit nothing rather than the header, which would repeat the message.
    return frames.length > 0 ? frames.join('\n') : undefined;
  }

  private static summarizeNode(opts: {
    value: unknown;
    depthLeft: number;
    seen: WeakSet<object>;
    isRoot: boolean;
    includeStack: boolean;
    maxStackFrames: number;
  }): IErrorSummary {
    const { value, depthLeft, seen, isRoot, includeStack, maxStackFrames } = opts;

    // A primitive - a string thrown as `cause`, a numeric code - is its own message.
    if (typeof value !== 'object' || value === null) {
      return { message: String(value) };
    }

    if (seen.has(value)) {
      return { message: '[Circular]' };
    }
    seen.add(value);

    const source = value as Record<string, unknown>;
    const summary: IErrorSummary = {};

    if (typeof source.name === 'string') {
      summary.name = source.name;
    }

    if (typeof source.message === 'string') {
      summary.message = source.message;
    }

    if (typeof source.code === 'string' || typeof source.code === 'number') {
      summary.code = source.code;
    }

    // Root only: a cause's frames point into the same libraries and add no location the root lacks.
    if (isRoot && includeStack) {
      const frames = this.extractFrames({ stack: source.stack, maxFrames: maxStackFrames });
      if (frames !== undefined) {
        summary.stack = frames;
      }
    }

    for (const key of this.DIAGNOSTIC_KEYS) {
      const diagnostic = source[key];
      if (typeof diagnostic === 'string' && diagnostic.length > 0) {
        summary[key] = diagnostic;
      }
    }

    if (source.cause !== undefined && source.cause !== null && depthLeft > 0) {
      summary.cause = this.summarizeNode({
        value: source.cause,
        depthLeft: depthLeft - 1,
        seen,
        isRoot: false,
        includeStack,
        maxStackFrames,
      });
    }

    // Nothing recognizable: inspect it (redacted) so an unmodelled shape still reaches the log.
    if (Object.keys(summary).length === 0) {
      return { message: util.inspect(redactSecrets(value), this.INSPECT_OPTIONS) };
    }

    return summary;
  }

  private static pushDiagnostics(opts: { node: IErrorSummary; lines: Array<string> }): void {
    const { node, lines } = opts;

    for (const key of this.DIAGNOSTIC_KEYS) {
      const diagnostic = node[key];
      if (diagnostic !== undefined) {
        lines.push(`${key}: ${diagnostic}`);
      }
    }
  }

  /** Reduces any thrown value to {@link IErrorSummary} - always a summary, never a bare primitive. */
  static summarize(opts: {
    error: unknown;
    includeStack?: boolean;
    maxCauseDepth?: number;
    maxStackFrames?: number;
  }): IErrorSummary {
    const {
      error,
      includeStack = true,
      maxCauseDepth = this.DEFAULT_MAX_CAUSE_DEPTH,
      maxStackFrames = this.DEFAULT_MAX_STACK_FRAMES,
    } = opts;

    return this.summarizeNode({
      value: error,
      depthLeft: maxCauseDepth,
      seen: new WeakSet(),
      isRoot: true,
      includeStack,
      maxStackFrames,
    });
  }

  /** Renders {@link summarize} as a block; returns a string so `%s` keeps the message's newlines. */
  static format(opts: {
    error: unknown;
    messageCode?: string;
    extra?: Record<string, unknown>;
    includeStack?: boolean;
  }): string {
    const { error, messageCode, extra, includeStack = true } = opts;
    const summary = this.summarize({ error, includeStack });

    const lines: Array<string> = [];
    const identity = [summary.name, summary.code === undefined ? '' : `(code ${summary.code})`]
      .filter(Boolean)
      .join(' ');

    // A bare `name: Error` says nothing; keep the line only when it is specific or carries a code.
    if (identity !== '' && identity !== 'Error') {
      lines.push(`name: ${identity}`);
    }

    if (messageCode !== undefined && messageCode !== '') {
      lines.push(`code: ${messageCode}`);
    }

    this.pushDiagnostics({ node: summary, lines });

    let cause = summary.cause;
    while (cause !== undefined) {
      const code = cause.code === undefined ? '' : ` (code ${cause.code})`;
      lines.push(`cause: ${cause.message ?? ''}${code}`);
      this.pushDiagnostics({ node: cause, lines });
      cause = cause.cause;
    }

    if (extra !== undefined && Object.keys(extra).length > 0) {
      lines.push(`extra: ${util.inspect(redactSecrets(extra), this.INSPECT_OPTIONS)}`);
    }

    if (summary.message !== undefined) {
      lines.push(`message:\n${summary.message}`);
    }

    if (summary.stack !== undefined) {
      lines.push(`stack:\n${summary.stack}`);
    }

    return lines.join('\n');
  }
}
