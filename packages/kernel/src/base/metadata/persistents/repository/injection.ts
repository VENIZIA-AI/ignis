import 'reflect-metadata';

import { BindingNamespaces } from '@/common/bindings';
import type { TRepositoryMetadata } from '@/helpers/inversion';
import { BindingKeys, MetadataKeys } from '@/helpers/inversion';
import type { MetadataRegistry } from '@/helpers/inversion';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { IInjectMetadata } from '@venizia/ignis-inversion';
import { getError } from '@venizia/ignis-helpers/core';
import { isDataSourceClass } from '../../../datasources';
import { validateFirstConstructorParameter } from './validate';

/**
 * Auto-injects dataSource at constructor param[0] unless explicit @inject exists. A class is injected
 * by the class itself, so the container reads the key its registration recorded: a pinned
 * `binding` and a minified class name both resolve. Only a string reference is a key.
 */
export const registerDataSourceInjection = (opts: {
  target: Function;
  registry: MetadataRegistry;
  dataSourceRef: TRepositoryMetadata['dataSource'];
  resolvedDataSource: string | Function;
}): void => {
  const { target, registry, dataSourceRef, resolvedDataSource } = opts;

  // Own metadata only: `getInjectMetadata` walks the prototype chain, so a repository extending another @repository class would see the BASE's injection at param[0] and silently resolve the base's dataSource.
  const ownInjects: IInjectMetadata[] | undefined = Reflect.getOwnMetadata(
    MetadataKeys.INJECT,
    target,
  );
  const injectAtIndex0 = ownInjects?.find((entry) => entry?.index === 0);

  if (injectAtIndex0) {
    // `@inject({ target })` carries no key; read the one recorded on the class. The function form
    // resolves through the same helper the container uses, so both paths read one class.
    const injectedTarget = injectAtIndex0.target
      ? ResolverUtility.resolveInjectTarget({ target: injectAtIndex0.target })
      : undefined;
    const injectKey =
      injectAtIndex0.key ??
      (injectedTarget ? registry.getBindingKey({ target: injectedTarget }) : undefined);

    // A class is judged by its brand: its key may sit under any namespace a `binding` pinned, and
    // a provisional key may still change at registration. Only a bare key is judged by its prefix.
    const isDataSourceTarget = injectedTarget
      ? isDataSourceClass(injectedTarget)
      : typeof injectKey === 'string' && injectKey.startsWith(`${BindingNamespaces.DATASOURCE}.`);

    if (!isDataSourceTarget) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must be a DataSource | Found @inject with key: '${String(injectKey)}' | Expected a key starting with '${BindingNamespaces.DATASOURCE}.' or a DataSource class`,
      });
    }

    return;
  }

  // Checked only when this decorator writes the injection: an explicit @inject decides for itself.
  // An interface emits `Object` and a type-only class import emits `Function` under tsc (`Object`
  // under bun); neither names the class, so neither is judged.
  const firstParamType = Reflect.getMetadata('design:paramtypes', target)?.[0];

  if (firstParamType && firstParamType !== Object && firstParamType !== Function) {
    validateFirstConstructorParameter({ target, firstParamType, resolvedDataSource });
  }

  // The inherited list is the base repository's own, and setInjectMetadata may write straight into it.
  if (!ownInjects) {
    Reflect.defineMetadata(
      MetadataKeys.INJECT,
      [...(registry.getInjectMetadata({ target }) ?? [])],
      target,
    );
  }

  const derivedKey = BindingKeys.build({
    namespace: BindingNamespaces.DATASOURCE,
    key: typeof resolvedDataSource === 'string' ? resolvedDataSource : resolvedDataSource.name,
  });

  // The class first, decided when the repository is resolved: by then any registration - decorated,
  // `bindingList()`, or `dataSource(X, { binding })` - has recorded its key on the class. The derived
  // key is the fallback for a class nothing recorded, bound by hand under exactly that key.
  registry.setInjectMetadata({
    target,
    index: 0,
    metadata:
      typeof dataSourceRef === 'string'
        ? { key: derivedKey, index: 0, isOptional: false }
        : { target: dataSourceRef, key: derivedKey, index: 0, isOptional: false },
  });
};
