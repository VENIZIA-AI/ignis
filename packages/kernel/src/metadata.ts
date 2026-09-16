/**
 * How a class is MARKED as an artifact, and nothing about how one is served.
 *
 * The root barrel is 161 KB gzipped, correctly - it carries the REST surface. This entry is 23 KB,
 * for a consumer that only registers and resolves classes.
 *
 * Listed export by export rather than re-exporting `base/metadata`, which today happens to be free
 * of the transport surface but promises nothing. The point of a sub-path is a surface someone
 * DECIDED on: what lands here is a choice, not whatever that directory grows into. The saving over
 * the barrel is about 2 KB; the boundary is the product.
 *
 * The weight is a contract, checked by `src/__tests__/bundle/browser-weight.test.ts`.
 */

export {
  component,
  configuration,
  injectable,
  pickRegistrationOptions,
  provide,
  service,
} from '@/base/metadata/injectable';
export { datasource, model, repository } from '@/base/metadata/persistents';
export { inject } from '@/base/metadata/injectors';

export { ArtifactNamespaces, BindingNamespaces } from '@/common/bindings';
export type { TBindingNamespace } from '@/common/bindings';

/**
 * `CoreBindings` is deliberately NOT here, and adding it back would be a mistake worth naming.
 *
 * The namespaces above are the GRAMMAR of a binding key - how one is spelled, whoever is doing the
 * binding. `CoreBindings` is one application's DICTIONARY: `APPLICATION_SERVER`,
 * `APPLICATION_ROOT_ROUTER`, keys a server binds and a browser never will. A second framework in
 * this house already ships its own `CoreBindings` whose `APPLICATION_INSTANCE` is a different
 * string, so exporting ours beside the stereotypes puts two same-named classes one import away from
 * each other - bind under one, resolve under the other, and nothing fails until run time.
 *
 * It stays on the root barrel, where a consumer asking for the server surface finds it.
 */

export { ArtifactTypes, BindingKeys, MetadataRegistry } from '@/helpers/inversion';
export type {
  IArtifactMetadata,
  IArtifactRegistrationOptions,
  TBindingScope,
} from '@/helpers/inversion';
