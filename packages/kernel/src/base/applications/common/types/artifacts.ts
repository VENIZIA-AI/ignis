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
