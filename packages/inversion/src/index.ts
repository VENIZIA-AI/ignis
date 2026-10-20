import 'reflect-metadata';
import { getError } from './modules/error/app-error';
import { MessageCode } from './modules/error/message-code';

export * from './common';
export * from './modules';

// Lives in the package entry, the one module every consumer evaluates and the only one
// declared in `sideEffects`: a bundler keeps it, so MessageCode throws ApplicationError in a
// bundle too.
MessageCode.useErrorFactory({ factory: getError });
