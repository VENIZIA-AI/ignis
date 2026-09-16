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

export { ArtifactNamespaces, BindingNamespaces, CoreBindings } from '@/common/bindings';
export type { TBindingNamespace } from '@/common/bindings';

export { ArtifactTypes, BindingKeys, MetadataRegistry } from '@/helpers/inversion';
export type {
  IArtifactMetadata,
  IArtifactRegistrationOptions,
  TBindingScope,
} from '@/helpers/inversion';
