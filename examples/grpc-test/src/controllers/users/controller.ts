import {
  BaseRestController,
  controller,
  jsonResponse,
  TRouteContext,
} from "@venizia/ignis";
import { HTTP, ValueOrPromise } from "@venizia/ignis-helpers";
import { z } from "@hono/zod-openapi";

const RouteConfigs = {
  LIST: {
    method: HTTP.Methods.GET,
    path: "/",
    responses: jsonResponse({
      schema: z.object({ users: z.array(z.string()) }),
      description: "List users",
    }),
  },
};

@controller({ path: "/users" })
export class UsersController extends BaseRestController {
  constructor() {
    super({ scope: "UsersController", path: "/users" });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: RouteConfigs.LIST }).to({
      handler: (context: TRouteContext) => {
        return context.json({ users: ["alice", "bob", "charlie"] }, 200);
      },
    });
  }
}
