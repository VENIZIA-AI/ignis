import * as kernel from '@venizia/ignis-kernel';

export const viaNamespace = kernel.ArtifactTypes.define({
  type: 'via-namespace',
  namespace: 'via-namespaces',
  scope: kernel.BindingScopes.SINGLETON,
});
