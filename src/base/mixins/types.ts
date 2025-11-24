import { AnyObject, IClass, ValueOrPromise } from '@/common/types';
import { IApplication } from '../applications';
import { BaseComponent } from '../components';
import { IDataSource } from '../datasources';
import { IRepository } from '../repositories';
import { IService } from '../services';

export interface IComponentMixin {
  component<T extends BaseComponent, O extends AnyObject = any>(
    ctor: IClass<T>,
    args?: O,
  ): IApplication;
  registerComponents(): ValueOrPromise<void>;
}

export interface IServerConfigMixin {
  staticConfigure(): ValueOrPromise<void>;
  preConfigure(): ValueOrPromise<void>;
  postConfigure(): ValueOrPromise<void>;
  getApplicationVersion(): ValueOrPromise<string>;
}

export interface IControllerMixin {
  controller<T>(ctor: IClass<T>): IApplication;
  registerControllers(): ValueOrPromise<void>;
}

export interface IRepositoryMixin {
  dataSource<T extends IDataSource>(ctor: IClass<T>): IApplication;
  repository<T extends IRepository>(ctor: IClass<T>): IApplication;
}

export interface IServiceMixin {
  service<T extends IService>(ctor: IClass<T>): IApplication;
}

export interface IStaticServeMixin {
  static(opts: { restPath?: string; folderPath: string }): IApplication;
}
