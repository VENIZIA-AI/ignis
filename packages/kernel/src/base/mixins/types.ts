import type { Binding } from '@/helpers/inversion';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplication } from '../applications';
import type { BaseComponent } from '../components';
import type { IDataSource } from '../datasources';
import type { IRepository } from '../repositories';
import type { IService } from '../services';

/** Options of the registration itself, never of the artifact - what the artifact needs goes on its class. */
export type TMixinOpts = {
  binding?: { namespace: string; key: string };
  /** Default true, matching `bind()`'s overwrite behavior; false makes a same-key re-registration throw. */
  allowOverride?: boolean;
};

export interface IComponentMixin {
  component<Base extends BaseComponent>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
  registerComponents(): ValueOrPromise<void>;
}

export interface IServerConfigMixin {
  staticConfigure(): ValueOrPromise<void>;
  preConfigure(): ValueOrPromise<void>;
  postConfigure(): ValueOrPromise<void>;
  getApplicationVersion(): ValueOrPromise<string>;
}

export interface IControllerMixin {
  controller<Base>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
  registerControllers(): ValueOrPromise<void>;
}

export interface IRepositoryMixin {
  dataSource<Base extends IDataSource>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
  repository<Base extends IRepository>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}

export interface IServiceMixin {
  service<Base extends IService>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}

export interface IStaticServeMixin {
  static(opts: { restPath?: string; folderPath: string }): IApplication;
}
