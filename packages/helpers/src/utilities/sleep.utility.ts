/** Split out of `date.utility.ts` - that module reads `process.env` at load time (dayjs timezone default), which would drag a node global into any bundle that only wants this one timer primitive. */
export const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
