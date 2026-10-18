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

/** A slice of artifacts whose classes are known only when they are registered: a shared package's `ArtifactGroup`, or `@venizia/ignis-boot/auto`. `content` is inlined by a build; otherwise `resolve` (or the resolver `@venizia/ignis-boot` installs) supplies it. The kind fields are typed never so a walker that destructures kinds still compiles - reading one throws. */
export interface IArtifactGroup extends Partial<Record<keyof IArtifactIndex, never>> {
  readonly isArtifactGroup: true;
  /** The directory name the group covers; undefined for the application's own root. */
  readonly folder: string | undefined;
  /** The module that defined the group, for the resolver and the error messages. */
  readonly site: string | undefined;
  readonly content: IArtifactIndex | undefined;
  /** Globs relative to the package `src` whose classes the group leaves out (`ArtifactGroup.application`). */
  readonly ignore?: ReadonlyArray<string>;
  resolve?(): Promise<IArtifactIndex>;
  /** Set on a slice (`ArtifactGroup.pick`): only these kinds are registered, and an empty slice is not an error. */
  readonly kinds?: ReadonlyArray<keyof IArtifactIndex>;
}

/** One index, a conditional entry, a group, or any nesting of arrays of them - a library exports one, an application composes several. */
export type TArtifactIndexInput =
  | IArtifactIndex
  | IConditionalArtifactIndex
  | IArtifactGroup
  | TArtifactIndexInput[];
