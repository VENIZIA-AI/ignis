/* import { TMixinTarget, ValueOrPromise } from '@/common';
import { AbstractApplication } from '../applications';
import { IServerConfigMixin } from './types';

export const ServerConfigMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  return class extends baseClass implements IServerConfigMixin {
    staticConfigure(): void {
      this.static({ folderPath: path.join(__dirname, '../public') });
    }

    preConfigure(): ValueOrPromise<void> {
      throw new Error('Method not implemented.');
    }

    postConfigure(): ValueOrPromise<void> {
      throw new Error('Method not implemented.');
    }

    getApplicationVersion(): ValueOrPromise<string> {
      throw new Error('Method not implemented.');
    }
  };
}; */
