import { TimeController } from "@/controllers/time";
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from "@venizia/ignis";
import { EchoComponent } from "./echo.component";

/** TimeComponent composes EchoComponent → registers EchoController + TimeController. */
export class TimeComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: "TimeComponent" });
  }

  override async binding(): Promise<void> {
    this.application.component(EchoComponent);

    this.application.controller(TimeController);
  }
}
