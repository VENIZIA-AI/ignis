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
      schema: z.object({
        orders: z.array(z.object({ id: z.string(), total: z.number() })),
      }),
      description: "List orders",
    }),
  },
};

@controller({ path: "/orders" })
export class OrdersController extends BaseRestController {
  constructor() {
    super({ scope: "OrdersController", path: "/orders" });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: RouteConfigs.LIST }).to({
      handler: (context: TRouteContext) => {
        return context.json(
          {
            orders: [
              { id: "ord-001", total: 99.99 },
              { id: "ord-002", total: 149.5 },
            ],
          },
          200,
        );
      },
    });
  }
}
