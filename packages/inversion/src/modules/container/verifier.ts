import type { TClass } from '@/common/types';
import type { IBinding } from '../binding/common/types';
import { getError } from '../error';
import type { IContainer } from './common/types';

/** A class (matched exactly, never by subclass), a class name, or a binding key. */
export type TBindingSkip = TClass<unknown> | string;

export interface IVerifyBindingsOptions {
  container: IContainer;

  /**
   * A binding is in a namespace when it carries the tag `Binding` sets from the first segment of its
   * key: `services.Orders` is in `services`. Required: inversion does not know which namespaces an
   * application uses. A namespace that itself holds a dot is not supported.
   */
  namespaces: string[];

  /** Bindings to leave unresolved. A skip that matches no enumerated binding is reported in `unmatchedSkips`. */
  skip?: TBindingSkip[];
}

export interface IBindingFailure {
  /** The binding that could not resolve, that is, who needs the missing thing. */
  key: string;
  message: string;

  /** An injected key nobody bound (`extra.unboundKey` of the container's error). */
  missingKey?: string;

  /** An injected class nobody registered (`extra.unregisteredClass` of the container's error). */
  unregisteredClass?: string;

  /** The thrown object, unchanged. */
  error: unknown;
}

export interface IBindingVerification {
  /** Keys resolved, in container order, namespaces in the order given. */
  verified: string[];
  failures: IBindingFailure[];
  unmatchedSkips: TBindingSkip[];
}

interface IClassBinding {
  boundClass: () => TClass<unknown> | undefined;
}

const hasBoundClass = (binding: IBinding): binding is IBinding & IClassBinding =>
  'boundClass' in binding && typeof binding.boundClass === 'function';

const classOf = (binding: IBinding): TClass<unknown> | undefined =>
  hasBoundClass(binding) ? binding.boundClass() : undefined;

const skipName = (skip: TBindingSkip): string => (typeof skip === 'string' ? skip : skip.name);

const matchesSkip = (opts: { skip: TBindingSkip; binding: IBinding }): boolean => {
  const { skip, binding } = opts;
  const bound = classOf(binding);

  if (typeof skip === 'string') {
    return skip === binding.key || (bound !== undefined && skip === bound.name);
  }

  return bound === skip;
};

const readString = (opts: { source: unknown; name: string }): string | undefined => {
  const { source, name } = opts;
  if (typeof source !== 'object' || source === null || !(name in source)) {
    return undefined;
  }

  const value = Reflect.get(source, name);
  return typeof value === 'string' ? value : undefined;
};

/** What a thrown value says about the thing it could not find; a constructor's own error says nothing. */
const readMissing = (error: unknown): { missingKey?: string; unregisteredClass?: string } => {
  const extra =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'extra') : undefined;
  const missingKey = readString({ source: extra, name: 'unboundKey' });
  const unregisteredClass = readString({ source: extra, name: 'unregisteredClass' });

  return {
    ...(missingKey === undefined ? {} : { missingKey }),
    ...(unregisteredClass === undefined ? {} : { unregisteredClass }),
  };
};

/**
 * Resolves every binding of the given namespaces once and reports every failure, instead of stopping
 * at the first. It changes nothing in the container. A failed binding is a result, never a throw:
 * `assertBindingsResolve` is the throwing form.
 */
export const verifyBindings = (opts: IVerifyBindingsOptions): IBindingVerification => {
  const { container, namespaces, skip = [] } = opts;

  const enumerated = new Map<string, IBinding>();
  for (const namespace of namespaces) {
    for (const binding of container.findByTag({ tag: namespace })) {
      if (!enumerated.has(binding.key)) {
        enumerated.set(binding.key, binding);
      }
    }
  }

  const matched = new Set<TBindingSkip>();
  const verified: string[] = [];
  const failures: IBindingFailure[] = [];

  for (const binding of enumerated.values()) {
    const skipped = skip.filter((candidate) => matchesSkip({ skip: candidate, binding }));
    for (const candidate of skipped) {
      matched.add(candidate);
    }

    if (skipped.length > 0) {
      continue;
    }

    try {
      container.get({ key: binding.key });
      verified.push(binding.key);
    } catch (error) {
      failures.push({
        key: binding.key,
        message: error instanceof Error ? error.message : String(error),
        ...readMissing(error),
        error,
      });
    }
  }

  return {
    verified,
    failures,
    unmatchedSkips: skip.filter((candidate) => !matched.has(candidate)),
  };
};

/**
 * `verifyBindings`, and one `ApplicationError` when a binding failed or a skip matched nothing: the
 * message lists `<key>: <message>` per failure, `extra.missing` maps each missing key or class name to
 * the bindings that needed it.
 */
export const assertBindingsResolve = (
  opts: IVerifyBindingsOptions & { scope: string },
): IBindingVerification => {
  const { scope, ...rest } = opts;
  const result = verifyBindings(rest);

  if (result.failures.length === 0 && result.unmatchedSkips.length === 0) {
    return result;
  }

  const parts = [
    ...result.failures.map((failure) => `${failure.key}: ${failure.message}`),
    ...result.unmatchedSkips.map((skip) => `skip matched no binding: ${skipName(skip)}`),
  ];

  const missing: Record<string, string[]> = {};
  for (const failure of result.failures) {
    const what = failure.missingKey ?? failure.unregisteredClass;
    if (what !== undefined) {
      missing[what] = [...(missing[what] ?? []), failure.key];
    }
  }

  const header =
    result.failures.length > 0
      ? `[${scope}] ${result.failures.length} binding(s) cannot be resolved | `
      : `[${scope}] `;

  throw getError({
    message: `${header}${parts.join(' | ')}`,
    extra: {
      failures: result.failures.map(({ key, message, missingKey, unregisteredClass }) => ({
        key,
        message,
        ...(missingKey === undefined ? {} : { missingKey }),
        ...(unregisteredClass === undefined ? {} : { unregisteredClass }),
      })),
      missing,
      unmatchedSkips: result.unmatchedSkips.map(skipName),
    },
  });
};
