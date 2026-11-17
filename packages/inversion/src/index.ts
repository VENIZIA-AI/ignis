import { getError } from './modules/error/app-error';
import { MessageCode } from './modules/error/message-code';

export * from './common';
export * from './modules';

// Lives in the package entry, the one module every consumer evaluates and the only one
// declared in `sideEffects`: a bundler keeps it, so MessageCode throws ApplicationError in a
// bundle too. `reflect-metadata` is not imported here: a module that calls `Reflect.*Metadata`
// imports it itself, so a browser that only throws an error does not ship it.
MessageCode.useErrorFactory({ factory: getError });
