import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IService } from './common';

/** Base class for services; `scope` names the logger scope. */
export abstract class BaseService extends BaseHelper implements IService {
  constructor(opts: { scope: string; identifier?: string }) {
    super(opts);
  }
}
