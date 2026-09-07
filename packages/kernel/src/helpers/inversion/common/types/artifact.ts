import type { TClass, TConstValue, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { TBindingScope } from '@venizia/ignis-inversion';
import { ArtifactTypes } from '../constants';

/** Decorator target for any constructable class (includes Function for ClassDecorator). */
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;

export type TArtifactType = TConstValue<typeof ArtifactTypes>;

/** Decides at registration time whether the class is registered at all. Sync or async; runs before `preConfigure`, so it may read config and env, never another artifact's binding. */
export type TArtifactCondition<ApplicationType = unknown> = (opts: {
  application: ApplicationType;
}) => ValueOrPromise<boolean>;

/** Registration defaults a class carries for itself; an explicit `TMixinOpts` at the call site still wins. */
export interface IArtifactRegistrationOptions<ApplicationType = unknown> {
  binding?: { namespace: string; key: string };
  allowOverride?: boolean;
  scope?: TBindingScope;
  /** Lower registers first within its kind. Default 0; ties keep index order. */
  order?: number;
  when?: TArtifactCondition<ApplicationType>;
}

export interface IArtifactMetadata<
  ApplicationType = unknown,
> extends IArtifactRegistrationOptions<ApplicationType> {
  type: TArtifactType;
}

/** One `@provide` method: the key it binds, and the binding scope of the value (default SINGLETON). */
export interface IProvideMetadata {
  methodName: string | symbol;
  key: string;
  scope?: TBindingScope;
}
