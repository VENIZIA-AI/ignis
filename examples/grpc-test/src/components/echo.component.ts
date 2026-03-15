import { EchoController } from "@/controllers/echo";
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from "@venizia/ignis";
import { ValueOrPromise } from "@venizia/ignis-helpers";

export class EchoComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: "EchoComponent" });
  }

  override binding(): ValueOrPromise<void> {
    this.application.controller(EchoController);
  }
}
