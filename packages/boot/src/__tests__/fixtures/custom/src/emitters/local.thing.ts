import { ArtifactTypes, BindingScopes } from '@venizia/ignis-kernel';

const local = ArtifactTypes.define({
  type: 'local',
  namespace: 'locals',
  scope: BindingScopes.TRANSIENT,
});

@local()
export class LocalThing {}
