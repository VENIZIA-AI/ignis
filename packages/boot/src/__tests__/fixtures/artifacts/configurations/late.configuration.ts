import { ArtifactTypes, injectable } from '@venizia/ignis';

/** The root-decorator path: `@injectable({ type })` must resolve the same as `@configuration()`. */
@injectable({ type: ArtifactTypes.CONFIGURATION })
export class LateConfiguration {}
