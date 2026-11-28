import { ControllerTransports, type IApplicationConfigs } from '@venizia/ignis';

/** The configuration `src/index.ts` and the end-to-end test share. */
export class ApplicationConfigs {
  /** `transports` is what turns the gRPC branch on: without `GRPC` the controller is never mounted. */
  static build(opts: { port: number }): IApplicationConfigs & { port: number } {
    return {
      port: opts.port,
      path: { base: '/api', isStrict: false },
      transports: [ControllerTransports.REST, ControllerTransports.GRPC],
    };
  }
}
