import { BaseHelper } from '@venizia/ignis-helpers';
import type { IService } from './types';

export abstract class BaseService extends BaseHelper implements IService {
  constructor(opts: { scope: string; identifier?: string }) {
    super(opts);
  }
}
