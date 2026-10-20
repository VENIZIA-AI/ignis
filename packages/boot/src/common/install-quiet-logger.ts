import { LoggerFactory } from '@venizia/ignis-helpers';
import { QuietLogger } from './quiet-logger';

// Imported first by the CLI: a provider registered after another module resolved its logger would still see the console fallback and its warning.
LoggerFactory.use({ provider: QuietLogger });
