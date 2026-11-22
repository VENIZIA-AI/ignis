import { ArtifactTypes as AT, BindingScopes } from '@venizia/ignis-kernel';

export const viaAlias = AT.define({
  type: 'via-alias',
  namespace: 'via-aliases',
  scope: BindingScopes.SINGLETON,
});
