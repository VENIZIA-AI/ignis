import { ArtifactTypes, BindingScopes } from '@venizia/ignis-kernel';

export const emitter = ArtifactTypes.define({
  type: 'emitter',
  namespace: 'emitters',
  scope: BindingScopes.SINGLETON,
});
