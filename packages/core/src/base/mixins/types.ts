import type { Binding } from '@/helpers/inversion';
import type { AnyObject, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import type { IApplication } from '../applications';
import type { BaseComponent } from '../components';
import type { IDataSource } from '../datasources';
import type { IRepository } from '../repositories';
import type { IService } from '../services';

export type TMixinOpts<Args extends AnyObject = any> = {
  binding: { namespace: string; key: string };
  args?: Args;
};

export interface IComponentMixin {
  component<Base extends BaseComponent, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base>;
  registerComponents(): ValueOrPromise<void>;
}

export interface IServerConfigMixin {
  staticConfigure(): ValueOrPromise<void>;
  preConfigure(): ValueOrPromise<void>;
  postConfigure(): ValueOrPromise<void>;
  getApplicationVersion(): ValueOrPromise<string>;
}

export interface IControllerMixin {
  controller<Base, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base>;
  registerControllers(): ValueOrPromise<void>;
}

export interface IRepositoryMixin {
  dataSource<Base extends IDataSource, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base>;
  repository<Base extends IRepository, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base>;
}

export interface IServiceMixin {
  service<Base extends IService, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base>;
}

export interface IStaticServeMixin {
  static(opts: { restPath?: string; folderPath: string }): IApplication;
}
