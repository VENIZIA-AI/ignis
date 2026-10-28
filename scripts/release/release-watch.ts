/**
 * Watches one workflow run until it completes. A run that waits for an approval (status `waiting`) is
 * a normal state, not a stall: the person who approves it may take minutes or an hour, and there are
 * nine runs in a release. So the watch has no deadline of its own, and says once, each time a run
 * enters the wait, that it is waiting for a person.
 */
export interface IRunStatus {
  status: string;
  conclusion?: string;
}

const POLL_MILLISECONDS = 10_000;
const WAITING_STATUS = 'waiting';
const COMPLETED_STATUS = 'completed';

export const watchRun = async (opts: {
  view: () => Promise<IRunStatus>;
  sleep: (milliseconds: number) => Promise<void>;
  onWaiting: () => void;
}): Promise<string> => {
  const { view, sleep, onWaiting } = opts;
  let wasWaiting = false;

  for (;;) {
    const { status, conclusion } = await view();

    if (status === COMPLETED_STATUS) {
      return conclusion ?? '';
    }

    const isWaiting = status === WAITING_STATUS;
    if (isWaiting && !wasWaiting) {
      onWaiting();
    }
    wasWaiting = isWaiting;

    await sleep(POLL_MILLISECONDS);
  }
};
