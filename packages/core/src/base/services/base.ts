import { BaseHelper } from '@venizia/ignis-helpers';
import type { IService } from './types';

/**
 * Base service class
 * All services should extend this
 */
export abstract class BaseService extends BaseHelper implements IService {
  constructor(opts: { scope: string }) {
    super({ scope: opts.scope });
  }
}
