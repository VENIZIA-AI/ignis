/**
 * How a class is MARKED as an artifact, and nothing about how one is served. 23 KB gzipped against
 * the root barrel's 161 KB, which carries the REST surface and is right to.
 *
 * Listed export by export rather than re-exporting `base/metadata`: a sub-path is a surface someone
 * decided on, not whatever a directory grows into. Weight is a contract, checked by
 * `src/__tests__/bundle/browser-weight.test.ts`.
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
 * `CoreBindings` is deliberately NOT here. The namespaces above are the GRAMMAR of a binding key;
 * `CoreBindings` is one application's DICTIONARY (`APPLICATION_SERVER`, `APPLICATION_ROOT_ROUTER`).
 * A sibling framework ships a class of the same name whose `APPLICATION_INSTANCE` is a different
 * string, so shipping ours beside the stereotypes means binding under one key and resolving under
 * another, with nothing failing until run time. It stays on the root barrel.
 */

export { ArtifactTypes, BindingKeys, MetadataRegistry } from '@/helpers/inversion';
export type {
  IArtifactMetadata,
  IArtifactRegistrationOptions,
  TBindingScope,
} from '@/helpers/inversion';
