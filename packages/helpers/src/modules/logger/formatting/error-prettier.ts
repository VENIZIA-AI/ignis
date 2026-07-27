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
  /** An `ApplicationError`'s caller context - the one unmodelled payload worth keeping. */
  extra?: Record<string, unknown>;
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

  /** A frame inside an installed package - `node_modules/` covers bun's `.bun/` store too. */
  private static readonly DEPENDENCY_FRAME_PATTERN = /node_modules[/\\]/;

  /** Issues rendered from a ZodError before the rest are counted off. */
  private static readonly MAX_ZOD_ISSUES = 10;

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
    let keptDependencyFrame = false;
    let omitted = 0;

    // Hand-rolled over split+filter+slice: it stops at maxFrames instead of walking the whole stack.
    for (const line of stack.split('\n')) {
      if (!this.FRAME_PATTERN.test(line)) {
        continue;
      }

      // The FIRST dependency frame is often the throw site (drizzle, jose); every later one is plumbing.
      const isDependencyFrame = this.DEPENDENCY_FRAME_PATTERN.test(line);

      if (isDependencyFrame && keptDependencyFrame) {
        omitted += 1;
        continue;
      }

      keptDependencyFrame = keptDependencyFrame || isDependencyFrame;
      frames.push(line);

      if (frames.length === maxFrames) {
        break;
      }
    }

    // Emit nothing rather than the header, which would repeat the message.
    if (frames.length === 0) {
      return undefined;
    }

    // Never truncate silently - a reader must know frames are missing, not assume the stack ended.
    return omitted > 0
      ? `${frames.join('\n')}\n    ... ${omitted} dependency frames`
      : frames.join('\n');
  }

  /** A ZodError's `message` is its issue array as pretty JSON - dozens of lines for one bad field. Render `path: reason` instead. */
  private static compressZodMessage(opts: { message: string }): string {
    const { message } = opts;

    let issues: unknown;

    try {
      issues = JSON.parse(message);
    } catch {
      // Not the JSON form (an already-formatted or hand-built ZodError) - leave it alone.
      return message;
    }

    if (!Array.isArray(issues) || issues.length === 0) {
      return message;
    }

    const lines = issues.slice(0, this.MAX_ZOD_ISSUES).map(issue => {
      const entry = issue as { path?: Array<string | number>; message?: string; code?: string };
      const path =
        Array.isArray(entry.path) && entry.path.length > 0 ? entry.path.join('.') : '(root)';

      return `${path}: ${entry.message ?? entry.code ?? 'invalid'}`;
    });

    const remaining = issues.length - lines.length;

    return remaining > 0 ? `${lines.join('\n')}\n... and ${remaining} more` : lines.join('\n');
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
      summary.message =
        source.name === 'ZodError'
          ? this.compressZodMessage({ message: source.message })
          : source.message;
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

    // Root only: `extra` is what a throw site deliberately attached, so a direct log call keeps it.
    if (isRoot && typeof source.extra === 'object' && source.extra !== null) {
      const extra = source.extra as Record<string, unknown>;
      if (Object.keys(extra).length > 0) {
        summary.extra = extra;
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
    inspectOptions?: util.InspectOptions;
  }): string {
    const {
      error,
      messageCode,
      extra,
      includeStack = true,
      inspectOptions = this.INSPECT_OPTIONS,
    } = opts;
    const summary = this.summarize({ error, includeStack });

    const lines: Array<string> = [];

    // What happened, then why, then who/where - a reader stops as soon as they have the answer.
    if (summary.message !== undefined) {
      lines.push(`message: ${summary.message}`);
    }

    let cause = summary.cause;
    while (cause !== undefined) {
      const code = cause.code === undefined ? '' : ` (code ${cause.code})`;
      lines.push(`cause: ${cause.message ?? ''}${code}`);
      this.pushDiagnostics({ node: cause, lines });
      cause = cause.cause;
    }

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

    // An explicit `extra` wins; otherwise fall back to the one the error carries itself.
    const context = extra ?? summary.extra;

    if (context !== undefined && Object.keys(context).length > 0) {
      lines.push(`extra: ${util.inspect(redactSecrets(context), inspectOptions)}`);
    }

    if (summary.stack !== undefined) {
      lines.push(`stack:\n${summary.stack}`);
    }

    return lines.map(line => `- ${line}`).join('\n');
  }
}
