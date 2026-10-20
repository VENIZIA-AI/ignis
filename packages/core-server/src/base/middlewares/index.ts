// `common`, `emoji-favicon`, `not-found` and the whole of `app-error`'s logic moved to the kernel.
// What stays here is the server half: `AppErrorMiddleware`, a subclass restoring the two reads a
// browser cannot make, and `request-spy`, whose constructor reads `process.env` directly.
export * from '@venizia/ignis-kernel';

export * from './app-error';
export * from './request-spy';
