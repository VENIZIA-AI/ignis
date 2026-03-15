import { OrdersController } from "@/controllers/orders";
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from "@venizia/ignis";
import { UsersComponent } from "./users.component";

/** OrdersComponent composes UsersComponent → registers UsersController + OrdersController. */
export class OrdersComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: "OrdersComponent" });
  }

  override async binding(): Promise<void> {
    this.application.component(UsersComponent);

    this.application.controller(OrdersController);
  }
}
