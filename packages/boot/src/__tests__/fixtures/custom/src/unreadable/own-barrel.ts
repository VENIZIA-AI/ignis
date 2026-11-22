import { ArtifactTypes, BindingScopes } from './kernel-barrel';

export const viaBarrel = ArtifactTypes.define({
  type: 'via-barrel',
  namespace: 'via-barrels',
  scope: BindingScopes.SINGLETON,
});
