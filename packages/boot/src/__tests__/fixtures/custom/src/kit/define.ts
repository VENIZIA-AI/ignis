import { ArtifactTypes, BindingScopes } from '@venizia/ignis-kernel';

export const emitter = ArtifactTypes.define({
  type: 'emitter',
  namespace: 'emitters',
  scope: BindingScopes.SINGLETON,
});

export const dynamic = ArtifactTypes.define({
  type: `dyn${1 + 1}`,
  namespace: 'dynamics',
  scope: BindingScopes.SINGLETON,
});

export const plain = () => (target: unknown) => target;
