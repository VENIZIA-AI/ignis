/**
 * Waiting for published packages to be installable.
 *
 * `npm view <package>@<version>` reads the packument, and the packument lists a version minutes
 * before its tarball answers: an install of the new version fails with a 404 in that window (seen on
 * the 0.4.4 release for several minutes). A release is not done when the workflow is green, it is
 * done when every tarball of the train answers 200.
 */
const REGISTRY = 'https://registry.npmjs.org';

type TFetch = (url: string, init?: { method?: string }) => Promise<{ ok: boolean; status: number }>;
type TSleep = (milliseconds: number) => Promise<void>;

export interface IPublishedPackage {
  packageName: string;
  version: string;
}

const DEFAULT_INTERVAL_MILLISECONDS = 5_000;
const DEFAULT_ATTEMPTS = 180;

const defaultSleep: TSleep = (milliseconds) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** `https://registry.npmjs.org/@scope/name/-/name-1.2.3.tgz`: the file is named by the unscoped name. */
export const tarballUrl = (opts: IPublishedPackage): string => {
  const unscoped = opts.packageName.split('/').pop() ?? opts.packageName;
  return `${REGISTRY}/${opts.packageName}/-/${unscoped}-${opts.version}.tgz`;
};

/**
 * Polls the tarball URL until it answers 2xx. A 404 and a network error both mean "not yet": the
 * registry is eventually consistent, and a dropped connection says nothing about the package.
 * Fifteen minutes by default.
 */
export const waitForTarball = async (
  opts: IPublishedPackage & {
    fetchFn?: TFetch;
    sleepFn?: TSleep;
    intervalMilliseconds?: number;
    attempts?: number;
  },
): Promise<void> => {
  const {
    fetchFn = fetch,
    sleepFn = defaultSleep,
    intervalMilliseconds = DEFAULT_INTERVAL_MILLISECONDS,
    attempts = DEFAULT_ATTEMPTS,
  } = opts;
  const url = tarballUrl(opts);
  let lastStatus = 'no answer';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchFn(url, { method: 'HEAD' }).catch(() => undefined);
    if (response?.ok) {
      return;
    }

    lastStatus = response ? String(response.status) : 'no answer';
    if (attempt < attempts) {
      await sleepFn(intervalMilliseconds);
    }
  }

  throw new Error(
    `${opts.packageName}@${opts.version} is listed on the registry, but its tarball still does not answer 200 after ${Math.round((attempts * intervalMilliseconds) / 60_000)} minute(s) (last answer: ${lastStatus}) | ${url}`,
  );
};

/** Every package of the train, in parallel: the release is done when the slowest one answers. */
export const waitForTarballs = async (opts: {
  packages: IPublishedPackage[];
  fetchFn?: TFetch;
  sleepFn?: TSleep;
  intervalMilliseconds?: number;
  attempts?: number;
}): Promise<void> => {
  const { packages, ...rest } = opts;
  await Promise.all(packages.map((published) => waitForTarball({ ...published, ...rest })));
};
