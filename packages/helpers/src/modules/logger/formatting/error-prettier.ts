import { redactSecrets } from '@/common/redact';
import { MessageCode } from '@/modules/error';
import util from 'node:util';
import { LoggerFormats, type TLoggerFormat } from '../common';

/** Useful-only projection of an error: a driver's `query`/`params` repeat the message and are dropped. */
export interface IErrorSummary {
  name?: string;
  message?: string;
  /** The error's OWN code - a driver's `23505`, a gRPC `14`. Belongs with the name, not with the message. */
  code?: string | number;
  /** An `ApplicationError`'s `normalized.code` - the identifier an application filters on. `MessageCode.DEFAULT` never surfaces. */
  messageCode?: string;
  /** Frames ONLY - V8's `Error: <message>` header is stripped so the message is not repeated. */
  stack?: string;
  hint?: string;
  detail?: string;
  table?: string;
  constraint?: string;
  /** Values for the `%{placeholder}` tokens left unresolved in `message` - i18n resolves them downstream, so the log must carry them or the message names no field. */
  args?: Record<string, unknown>;
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

  /** `getError` sits on top of every `ApplicationError` stack and names no call site. Installed, it is also the FIRST dependency frame, so the keep-the-first rule would preserve exactly the wrong one. Anchored on `inversion` so an application's own `modules/error/app-error` is not swallowed with it. */
  private static readonly ERROR_FACTORY_FRAME_PATTERN =
    /inversion[/\\].*modules[/\\]error[/\\]app-error/;

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

      // Not counted as omitted: a factory frame is noise, and reporting it would imply signal was dropped.
      if (this.ERROR_FACTORY_FRAME_PATTERN.test(line)) {
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

    const normalized =
      typeof source.normalized === 'object' && source.normalized !== null
        ? (source.normalized as { code?: unknown; args?: unknown })
        : undefined;

    // `MessageCode.resolve` stamps DEFAULT on every codeless error, so surfacing it blindly would put a meaningless line on every log.
    if (typeof normalized?.code === 'string' && normalized.code !== MessageCode.DEFAULT) {
      summary.messageCode = normalized.code;
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

    // Root only: the args fill the ROOT's message; a cause's belong to a message this block does not print.
    if (isRoot && typeof normalized?.args === 'object' && normalized.args !== null) {
      const args = normalized.args as Record<string, unknown>;
      if (Object.keys(args).length > 0) {
        summary.args = args;
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

  /** Resolved per call, not at module load, so a test passes a value instead of mutating the environment. */
  private static resolveFormat(configured?: TLoggerFormat): TLoggerFormat {
    if (configured !== undefined) {
      return configured;
    }

    const fromEnv = process.env.APP_ENV_LOGGER_FORMAT;

    return fromEnv !== undefined && LoggerFormats.isValid(fromEnv) ? fromEnv : LoggerFormats.TEXT;
  }

  /** `JSON.stringify` throws on a cycle, and `format` runs inside the error handler - a throw there turns a handled failure into an unhandled one. `redactSecrets` breaks cycles on its own, but it is switched off by `APP_ENV_LOGGER_DO_REDACT=false`, so structural safety cannot lean on it. A repeated reference reads as `[Circular]` too: the first occurrence still carries the data. */
  private static safeStringify(payload: Record<string, unknown>): string {
    const seen = new WeakSet<object>();

    return JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        return value;
      }

      if (seen.has(value)) {
        return '[Circular]';
      }

      seen.add(value);
      return value;
    });
  }

  /** One line, so a log monitor keeps the error as ONE record instead of one per bullet. */
  private static renderJson(opts: {
    summary: IErrorSummary;
    messageCode?: string;
    extra?: Record<string, unknown>;
  }): string {
    const { summary, messageCode, extra } = opts;

    const payload: Record<string, unknown> = {};

    if (summary.message !== undefined) {
      payload.message = summary.message;
    }

    if (summary.args !== undefined) {
      payload.args = redactSecrets(summary.args);
    }

    // An ApplicationError has no own `code` and a driver error has no `normalized`, so one field never hides the other.
    const code =
      messageCode !== undefined && messageCode !== ''
        ? messageCode
        : (summary.messageCode ?? summary.code);
    if (code !== undefined) {
      payload.code = code;
    }

    // A bare `Error` says nothing; the text block drops it for the same reason.
    if (summary.name !== undefined && summary.name !== 'Error') {
      payload.name = summary.name;
    }

    for (const key of this.DIAGNOSTIC_KEYS) {
      if (summary[key] !== undefined) {
        payload[key] = summary[key];
      }
    }

    const context = extra ?? summary.extra;
    if (context !== undefined && Object.keys(context).length > 0) {
      payload.extra = redactSecrets(context);
    }

    if (summary.cause !== undefined) {
      payload.cause = summary.cause;
    }

    // An ARRAY, not the newline-joined string `text` prints: a monitor can count and slice frames.
    if (summary.stack !== undefined) {
      payload.stack = summary.stack.split('\n').map(frame => frame.trim());
    }

    return this.safeStringify(payload);
  }

  private static renderText(opts: {
    summary: IErrorSummary;
    messageCode?: string;
    extra?: Record<string, unknown>;
    inspectOptions: util.InspectOptions;
  }): string {
    const { summary, messageCode, extra, inspectOptions } = opts;

    const lines: Array<string> = [];

    // What happened, then why, then who/where - a reader stops as soon as they have the answer.
    if (summary.message !== undefined) {
      lines.push(`message: ${summary.message}`);
    }

    // Straight after the message: the reader is looking at `%{field}` and needs the value now, not below the stack.
    if (summary.args !== undefined) {
      lines.push(`args: ${util.inspect(redactSecrets(summary.args), inspectOptions)}`);
    }

    let cause = summary.cause;
    while (cause !== undefined) {
      const causeCode = cause.code ?? cause.messageCode;
      const code = causeCode === undefined ? '' : ` (code ${causeCode})`;
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

    // The caller's code wins; otherwise the error's own, so a direct log call keeps its identifier too.
    const code =
      messageCode !== undefined && messageCode !== '' ? messageCode : summary.messageCode;
    if (code !== undefined) {
      lines.push(`code: ${code}`);
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

  /** Renders {@link summarize}. `text` returns a block whose newlines survive `%s`; `json` returns one line. */
  static format(opts: {
    error: unknown;
    messageCode?: string;
    extra?: Record<string, unknown>;
    includeStack?: boolean;
    maxStackFrames?: number;
    format?: TLoggerFormat;
    inspectOptions?: util.InspectOptions;
  }): string {
    const {
      error,
      messageCode,
      extra,
      includeStack = true,
      maxStackFrames,
      format,
      inspectOptions = this.INSPECT_OPTIONS,
    } = opts;

    const summary = this.summarize({ error, includeStack, maxStackFrames });

    if (this.resolveFormat(format) === LoggerFormats.JSON) {
      return this.renderJson({ summary, messageCode, extra });
    }

    return this.renderText({ summary, messageCode, extra, inspectOptions });
  }
}
