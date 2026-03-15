import { UsersController } from "@/controllers/users";
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from "@venizia/ignis";
import { ValueOrPromise } from "@venizia/ignis-helpers";

export class UsersComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: "UsersComponent" });
  }

  override binding(): ValueOrPromise<void> {
    this.application.controller(UsersController);
  }
}
