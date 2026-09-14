// The resolver vocabulary lives in inversion, the lowest layer, because `@inject({ target })` needs
// it there. One declaration, re-exported here so every `@venizia/ignis-helpers/common` import keeps
// working.
export type {
  TAsyncResolver,
  TResolver,
  TValueOrAsyncResolver,
  TValueOrResolver,
} from '@venizia/ignis-inversion';
