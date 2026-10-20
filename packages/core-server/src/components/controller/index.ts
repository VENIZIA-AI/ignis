// `RestComponent` moved to `@venizia/ignis-kernel` - `RestApplication` owns REST controller
// registration by inheritance now. This package's own `@/index` re-export of the kernel barrel
// still surfaces it publicly.
// gRPC excluded from this barrel - import directly from the subpath.
// export * from './grpc';
