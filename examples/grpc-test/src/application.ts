import {
  BaseApplication,
  ControllerTransports,
  IApplicationConfigs,
  IApplicationInfo,
} from "@venizia/ignis";
import { ValueOrPromise } from "@venizia/ignis-helpers";
import { OrdersComponent, TimeComponent } from "@/components";
import {
  GreeterController,
  HealthController,
  StatusController,
} from "@/controllers";
import { GreeterService, HealthService } from "@/services";

export const appConfigs: IApplicationConfigs = {
  host: "0.0.0.0",
  port: 3000,
  path: { base: "/", isStrict: false },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
};

export class Application extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return {
      name: "grpc-test",
      version: "0.0.0",
      description: "gRPC + REST example with Ignis",
    };
  }

  staticConfigure() {}

  preConfigure() {
    // Services
    this.service(GreeterService);
    this.service(HealthService);

    // Direct controller registration — gRPC
    this.controller(GreeterController);
    this.controller(HealthController);

    // Direct controller registration — REST
    this.controller(StatusController);

    // Component-bound controllers (resolved via DI in registerComponents phase)
    // OrdersComponent composes UsersComponent → registers UsersController + OrdersController
    this.component(OrdersComponent);
    // TimeComponent composes EchoComponent → registers EchoController + TimeController
    this.component(TimeComponent);
  }

  postConfigure() {}

  setupMiddlewares() {}
}
