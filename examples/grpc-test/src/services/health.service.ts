import type { PingRequest } from "@/controllers/health/definition";
import { BaseService } from "@venizia/ignis";

export interface IPongResult {
  message: string;
  tz: string;
  took: number;
}

export class HealthService extends BaseService {
  constructor() {
    super({ scope: "HealthService" });
  }

  async ping(opts: { request: PingRequest }): Promise<IPongResult> {
    const t = performance.now();
    const message = opts.request.message || "pong";
    const tz =
      opts.request.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      message,
      tz,
      took: Math.round(performance.now() - t),
    };
  }
}
