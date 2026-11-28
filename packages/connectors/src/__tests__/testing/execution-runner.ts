/** Fills or empties the runner of this process, which an application can only fill once. */
export const useExecutionRunner = (opts: { isInstalled: boolean }) => {
  globalThis.ignisExecutionRunner = opts.isInstalled
    ? {
        read: () => undefined,
        capture: () => ({ values: {} }),
        run: async (options) => options.task(),
        runFrame: (options) => options.task(),
      }
    : undefined;
};
