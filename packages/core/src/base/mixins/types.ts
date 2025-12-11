import { AnyObject, Binding, TClass, ValueOrPromise } from "@venizia/ignis-helpers";
import { IApplication } from "../applications";
import { BaseComponent } from "../components";
import { IDataSource } from "../datasources";
import { TTableSchemaWithId } from "../models";
import { IRepository } from "../repositories";
import { IService } from "../services";

export interface IComponentMixin {
  component<T extends BaseComponent, O extends AnyObject = any>(
    ctor: TClass<T>,
    args?: O,
  ): Binding<T>;
  registerComponents(): ValueOrPromise<void>;
}

export interface IServerConfigMixin {
  staticConfigure(): ValueOrPromise<void>;
  preConfigure(): ValueOrPromise<void>;
  postConfigure(): ValueOrPromise<void>;
  getApplicationVersion(): ValueOrPromise<string>;
}

export interface IControllerMixin {
  controller<T>(ctor: TClass<T>): Binding<T>;
  registerControllers(): ValueOrPromise<void>;
}

export interface IRepositoryMixin {
  dataSource<T extends IDataSource>(ctor: TClass<T>): Binding<T>;
  repository<T extends IRepository<TTableSchemaWithId>>(ctor: TClass<T>): Binding<T>;
}

export interface IServiceMixin {
  service<T extends IService>(ctor: TClass<T>): Binding<T>;
}

export interface IStaticServeMixin {
  static(opts: { restPath?: string; folderPath: string }): IApplication;
}
