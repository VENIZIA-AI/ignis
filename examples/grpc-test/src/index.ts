/**
 * gRPC Server — starts an Ignis application with ConnectRPC support.
 *
 * Usage:
 *   bun run server:dev
 *
 * The server exposes:
 *   - ConnectRPC endpoints at /grpc/greeter.v1.GreeterService/*
 *   - Connect protocol (HTTP/1.1 JSON + Protobuf)
 *   - gRPC-Web protocol (HTTP/1.1)
 */

import { LoggerFactory } from "@venizia/ignis-helpers";
import { Application, appConfigs } from "./application";

const logger = LoggerFactory.getLogger(["main"]);

const main = async () => {
  const application = new Application({
    scope: "Application",
    config: appConfigs,
  });

  application.init();

  logger.for("main").info("Starting gRPC example server...");

  await application.start();
};

main().catch((err) => {
  logger.error("[main] Failed to start | Error: %s", err);
  process.exit(1);
});
