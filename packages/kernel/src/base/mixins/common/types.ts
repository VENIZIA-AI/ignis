import type { Binding } from '@/helpers/inversion';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplication, TArtifactIndexInput } from '../../applications';
import type { BaseComponent } from '../../components';
import type { BaseConfiguration } from '../../configurations';
import type { IDataSource } from '../../datasources';
import type { IRepository } from '../../repositories';
import type { IService } from '../../services';
/** Options of the registration itself, never of the artifact - what the artifact needs goes on its class. */
export type TMixinOpts<Options extends object = {}> = {
  binding?: { namespace: string; key: string };
  /** Default true, matching `bind()`'s overwrite behavior; false makes a same-key re-registration throw. */
  allowOverride?: boolean;
  /** Options passed directly to `instance.configure(options)` during initialization. */
  options?: Options;
};

export interface IConfigurationMixin {
  configuration<Base extends BaseConfiguration<Options>, Options extends object = {}>(
    target: TClass<Base>,
    opts?: TMixinOpts<Options>,
  ): Binding<Base>;
  registerConfigurations(): ValueOrPromise<void>;
}

export interface IComponentMixin {
  component<Base extends BaseComponent<Options>, Options extends object = {}>(
    target: TClass<Base>,
    opts?: TMixinOpts<Options>,
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
  controller<Base>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
  registerControllers(): ValueOrPromise<void>;
}

export interface IRepositoryMixin {
  dataSource<Base extends IDataSource<Options>, Options extends object = {}>(
    target: TClass<Base>,
    opts?: TMixinOpts<Options>,
  ): Binding<Base>;
  repository<Base extends IRepository>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}
export interface IServiceMixin {
  service<Base extends IService>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}

export interface IArtifactRegistrationMixin {
  registerArtifacts(index: TArtifactIndexInput): Promise<void>;
}

export interface IStaticServeMixin {
  static(opts: { restPath?: string; folderPath: string }): IApplication;
}
