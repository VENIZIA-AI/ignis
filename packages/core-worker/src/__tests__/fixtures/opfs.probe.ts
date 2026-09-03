/**
 * Compiled by `browser-purity.test.ts` against `tsconfig.build.json`, where it must SUCCEED. OPFS is
 * where a browser-side database lives, and `lib: ["ES2024", "WebWorker"]` is what types it.
 */
export const openStorageRoot = async (): Promise<FileSystemDirectoryHandle> =>
  navigator.storage.getDirectory();

export const closeAccessHandle = ({ handle }: { handle: FileSystemSyncAccessHandle }): void => {
  handle.close();
};
