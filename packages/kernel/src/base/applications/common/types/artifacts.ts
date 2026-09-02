import type { TClass } from '@venizia/ignis-helpers/common';
import type { BaseComponent } from '../../../components';
import type { IDataSource } from '../../../datasources';
import type { IRepository } from '../../../repositories';
import type { IService } from '../../../services';

/** The shape `@venizia/ignis-boot`'s generator emits and `registerArtifacts()` consumes. Kinds are registered in this field order. */
export interface IArtifactIndex {
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

/** One index, or any nesting of arrays of indexes - a library exports one, an application composes several. */
export type TArtifactIndexInput = IArtifactIndex | TArtifactIndexInput[];

/**
 * Structural mirror of `@venizia/ignis-boot`'s `IBootOptions` - kernel does not depend on boot
 * (boot sits beside kernel in the Makefile chain, `{boot, kernel} -> core`; importing boot's type
 * here would invert that). Both shapes are the same artifact-glob bag keyed by artifact type, so a
 * real `IBootOptions` value is structurally assignable to this without a cast.
 */
export interface IApplicationArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  isNested?: boolean;
  glob?: string;
}

export interface IApplicationBootOptions {
  [artifactType: string]: IApplicationArtifactOptions | undefined;
}
