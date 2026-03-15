import {
  BaseRestController,
  controller,
  jsonResponse,
  TRouteContext,
} from "@venizia/ignis";
import { HTTP, ValueOrPromise } from "@venizia/ignis-helpers";
import { z } from "@hono/zod-openapi";

const RouteConfigs = {
  ROOT: {
    method: HTTP.Methods.GET,
    path: "/",
    responses: jsonResponse({
      schema: z.object({ status: z.string(), uptime: z.number() }),
      description: "Application status",
    }),
  },
};

@controller({ path: "/status" })
export class StatusController extends BaseRestController {
  constructor() {
    super({ scope: "StatusController", path: "/status" });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: RouteConfigs.ROOT }).to({
      handler: (context: TRouteContext) => {
        return context.json(
          { status: "ok", uptime: Math.floor(process.uptime()) },
          200,
        );
      },
    });
  }
}
