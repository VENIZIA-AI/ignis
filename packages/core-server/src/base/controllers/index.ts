// Every controller tier moved to the kernel except gRPC (ConnectRPC over `node:async_hooks` /
// `node:module` - inherently server-only, never browser-pure).
export * from '@venizia/ignis-kernel';

export * from './grpc';
