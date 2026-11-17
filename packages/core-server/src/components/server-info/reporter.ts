import type { IServerTime } from './common';

/** Assembles what `GET <path>/time` answers. Reads the clock and the process time zone, nothing else. */
export class ServerInfoReporter {
  private static readonly MINUTES_PER_HOUR = 60;
  private static readonly MS_PER_SECOND = 1000;
  private static readonly MS_PER_MINUTE = 60_000;

  private static readonly formatters = new Map<string, Intl.DateTimeFormat>();

  private static getFormatter(opts: { timeZone: string }): Intl.DateTimeFormat {
    const cached = ServerInfoReporter.formatters.get(opts.timeZone);

    if (cached) {
      return cached;
    }

    // `h23` keeps midnight as `00`; the default `h24` of some locales prints `24`.
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: opts.timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    ServerInfoReporter.formatters.set(opts.timeZone, formatter);

    return formatter;
  }

  /** `+07:00` style text for an offset in minutes, positive east of UTC; `+00:00` for UTC itself. */
  static formatUtcOffset(opts: { minutes: number }): string {
    const sign = opts.minutes < 0 ? '-' : '+';
    const absolute = Math.abs(opts.minutes);
    const hh = String(Math.trunc(absolute / ServerInfoReporter.MINUTES_PER_HOUR)).padStart(2, '0');
    const mm = String(absolute % ServerInfoReporter.MINUTES_PER_HOUR).padStart(2, '0');

    return `${sign}${hh}:${mm}`;
  }

  /** The process time zone as the runtime resolved it (`TZ`, or the host setting). */
  static resolveTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Every field comes from the one `now`, so `server.iso`, `server.epoch` and `utc.iso` name the
   * same instant. The offset is read from the zone AT that instant (a DST change moves it), not
   * from the zone's standard offset.
   */
  static buildTime(opts?: { now?: Date; timeZone?: string }): IServerTime {
    const now = opts?.now ?? new Date();
    const tz = opts?.timeZone ?? ServerInfoReporter.resolveTimeZone();
    const epoch = now.getTime();

    const parts: Record<string, string> = {};

    for (const part of ServerInfoReporter.getFormatter({ timeZone: tz }).formatToParts(now)) {
      parts[part.type] = part.value;
    }

    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const ms = String(
      ((epoch % ServerInfoReporter.MS_PER_SECOND) + ServerInfoReporter.MS_PER_SECOND) %
        ServerInfoReporter.MS_PER_SECOND,
    ).padStart(3, '0');
    const time = `${parts.hour}:${parts.minute}:${parts.second}.${ms}`;

    // The wall clock, read back as if it were UTC, minus the true instant (both cut to the
    // second) is the zone's offset. Intl has no offset field that is portable across runtimes.
    const wallAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const epochSecond =
      Math.floor(epoch / ServerInfoReporter.MS_PER_SECOND) * ServerInfoReporter.MS_PER_SECOND;
    const minutes = (wallAsUtc - epochSecond) / ServerInfoReporter.MS_PER_MINUTE;
    const offset = ServerInfoReporter.formatUtcOffset({ minutes });

    return {
      server: { date, time, epoch, iso: `${date}T${time}${offset}` },
      tz,
      utc: { offset, minutes, iso: now.toISOString() },
    };
  }
}
