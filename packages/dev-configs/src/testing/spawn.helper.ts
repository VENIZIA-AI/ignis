/** Long enough for a cold `bun build` under a loaded parallel run; it bounds a stall, not a slow run. */
export const SPAWN_TIMEOUT_MS = 120_000;

export class SpawnHelper {
  /**
   * `Bun.spawnSync`, bounded. A sync spawn blocks the worker thread, so bun's own test timeout cannot
   * fire while it waits: the `timeout` option is the only bound. Its default signal, SIGTERM, can be
   * outlived by a stuck child - one such child once stalled a whole suite for 770s - so this kills with
   * SIGKILL, and throws naming the command instead of returning a half-finished result.
   */
  static spawnSyncBounded<
    const In extends Bun.SpawnOptions.Writable = 'ignore',
    const Out extends Bun.SpawnOptions.Readable = 'pipe',
    const Err extends Bun.SpawnOptions.Readable = 'pipe',
  >(opts: Bun.SpawnOptions.SpawnSyncOptions<In, Out, Err> & { cmd: string[]; onExit?: undefined }) {
    const timeout = opts.timeout ?? SPAWN_TIMEOUT_MS;
    const result = Bun.spawnSync<In, Out, Err>({
      ...opts,
      timeout,
      killSignal: 'SIGKILL' as const,
    });

    if (result.exitedDueToTimeout) {
      // eslint-disable-next-line venizia/no-new-error -- getError would be a dev-configs -> inversion cycle
      throw new Error(
        `[spawnSyncBounded] did not exit within ${timeout} ms, killed | cmd: ${opts.cmd.join(' ').slice(0, 200)}`,
      );
    }

    return result;
  }
}

/** @deprecated Use `SpawnHelper.spawnSyncBounded({ cmd, ... })`. Removed in 0.5. */
export const spawnSyncBounded = SpawnHelper.spawnSyncBounded;
