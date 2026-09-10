import type { TArtifactCondition } from '@/helpers/inversion/common/types';
import type { TClass } from '@venizia/ignis-helpers/common';
import type { BaseComponent } from '../../../components';
import type { BaseConfiguration } from '../../../configurations';
import type { IDataSource } from '../../../datasources';
import type { IRepository } from '../../../repositories';
import type { IService } from '../../../services';

/** The shape `@venizia/ignis-boot`'s generator emits and `registerArtifacts()` consumes. Kinds are registered in this field order. */
export interface IArtifactIndex {
  configurations?: ReadonlyArray<TClass<BaseConfiguration>>;
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

/** An index (or nested indexes) registered only when `when` answers true - the run-mode gate: a worker keeps its controllers out of the container instead of mounting routes no security step guards. Extends the never-typed kind fields so code that destructures kinds from a non-array input still compiles against the union. */
export interface IConditionalArtifactIndex extends Partial<Record<keyof IArtifactIndex, never>> {
  when: TArtifactCondition;
  index: TArtifactIndexInput;
}

/** One index, a conditional entry, or any nesting of arrays of them - a library exports one, an application composes several. */
export type TArtifactIndexInput =
  IArtifactIndex | IConditionalArtifactIndex | TArtifactIndexInput[];
