#!/usr/bin/env bun
import { LoggerFactory } from '@venizia/ignis-helpers';
import { AtlasConstants } from './common';
import { StderrLogger } from './common/logger';

// Must run before any code that could log: this is the only place a provider is ever registered.
LoggerFactory.use({ provider: StderrLogger });

console.error(`${AtlasConstants.SERVER_NAME}: not implemented yet`);
process.exit(2);
