import type { IArtifactRegistrationOptions } from '@venizia/ignis-kernel';

export declare const builtDecorator: <ApplicationType = unknown>(
  registration?: IArtifactRegistrationOptions<ApplicationType>,
) => ClassDecorator;
