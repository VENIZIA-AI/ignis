// Every controller tier moved to the kernel except gRPC: its peers are loaded through `node:module`, so it is
// server-only and never browser-pure.
export * from '@venizia/ignis-kernel';

export * from './grpc';
