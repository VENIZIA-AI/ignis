import { Binding } from '@/helpers/inversion';
import { AnyObject, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import { IApplication } from '../applications';
import { BaseComponent } from '../components';
import { IDataSource } from '../datasources';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';
import { IService } from '../services';

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
  repository<Base extends IRepository<TTableSchemaWithId>, Args extends AnyObject = any>(
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
