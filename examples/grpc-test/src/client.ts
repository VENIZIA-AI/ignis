/**
 * gRPC + REST Client — tests all endpoints.
 *
 * Usage:
 *   1. Start the server:  bun run server:dev
 *   2. Run the client:    bun run client:dev
 *
 * Transport support (Connect protocol over HTTP/1.1):
 *   - Unary:            fully supported
 *   - Server streaming:  supported (chunked transfer encoding)
 *   - Client streaming:  requires HTTP/2 (gRPC protocol)
 *   - Bidi streaming:    requires HTTP/2 (gRPC protocol)
 */

import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { EchoRequestSchema, EchoService } from "@/controllers/echo";
import { GreeterService, SayHelloRequestSchema } from "@/controllers/greeter";
import { HealthService, PingRequestSchema } from "@/controllers/health";
import { GetTimeRequestSchema, TimeService } from "@/controllers/time";

const BASE_URL = "http://localhost:3000";
const GRPC_URL = `${BASE_URL}/grpc`;

let hasFailure = false;

function pass(label: string, detail?: string) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, error: unknown) {
  hasFailure = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`  FAIL  ${label} — ${message}`);
}

// ---------------------------------------------------------------------------
// REST endpoint tests
// ---------------------------------------------------------------------------
async function testRestEndpoints() {
  console.log("\n=== REST Endpoints ===\n");

  // Direct: GET /status
  try {
    const res = await fetch(`${BASE_URL}/status`);
    const body = (await res.json()) as { status: string; uptime: number };

    if (res.status === 200 && body.status === "ok") {
      pass("GET /status (direct)", `status=${body.status}, uptime=${body.uptime}`);
    } else {
      fail("GET /status (direct)", `unexpected: ${JSON.stringify(body)}`);
    }
  } catch (error) {
    fail("GET /status (direct)", error);
  }

  // Component-bound (OrdersComponent -> UsersComponent): GET /users
  try {
    const res = await fetch(`${BASE_URL}/users`);
    const body = (await res.json()) as { users: string[] };

    if (res.status === 200 && Array.isArray(body.users) && body.users.length > 0) {
      pass("GET /users (UsersComponent)", `users=[${body.users.join(", ")}]`);
    } else {
      fail("GET /users (UsersComponent)", `unexpected: ${JSON.stringify(body)}`);
    }
  } catch (error) {
    fail("GET /users (UsersComponent)", error);
  }

  // Component-bound (OrdersComponent): GET /orders
  try {
    const res = await fetch(`${BASE_URL}/orders`);
    const body = (await res.json()) as { orders: { id: string; total: number }[] };

    if (res.status === 200 && Array.isArray(body.orders) && body.orders.length > 0) {
      pass("GET /orders (OrdersComponent)", `count=${body.orders.length}`);
    } else {
      fail("GET /orders (OrdersComponent)", `unexpected: ${JSON.stringify(body)}`);
    }
  } catch (error) {
    fail("GET /orders (OrdersComponent)", error);
  }
}

// ---------------------------------------------------------------------------
// gRPC endpoint tests
// ---------------------------------------------------------------------------
async function testGrpcEndpoints() {
  console.log("\n=== gRPC Endpoints ===\n");

  const transport = createConnectTransport({ baseUrl: GRPC_URL });

  // Direct: GreeterService.SayHello
  try {
    const client = createClient(GreeterService, transport);
    const res = await client.sayHello(create(SayHelloRequestSchema, { name: "Ignis" }));

    if (res.message.includes("Ignis")) {
      pass("GreeterService.SayHello (direct)", res.message);
    } else {
      fail("GreeterService.SayHello (direct)", `unexpected: ${res.message}`);
    }
  } catch (error) {
    fail("GreeterService.SayHello (direct)", error);
  }

  // Direct: GreeterService.ListUsers
  try {
    const client = createClient(GreeterService, transport);
    const res = await client.listUsers({});

    if (res.users.length > 0) {
      pass("GreeterService.ListUsers (direct)", `count=${res.users.length}`);
    } else {
      fail("GreeterService.ListUsers (direct)", "no users returned");
    }
  } catch (error) {
    fail("GreeterService.ListUsers (direct)", error);
  }

  // Direct: HealthService.Ping
  try {
    const client = createClient(HealthService, transport);
    const res = await client.ping(create(PingRequestSchema, { message: "hello" }));

    if (res.message) {
      pass("HealthService.Ping (direct)", `message=${res.message}, tz=${res.tz}`);
    } else {
      fail("HealthService.Ping (direct)", "empty response");
    }
  } catch (error) {
    fail("HealthService.Ping (direct)", error);
  }

  // Component-bound (EchoComponent via TimeComponent): EchoService.Echo
  try {
    const client = createClient(EchoService, transport);
    const res = await client.echo(create(EchoRequestSchema, { message: "test" }));

    if (res.message.includes("test")) {
      pass("EchoService.Echo (EchoComponent)", res.message);
    } else {
      fail("EchoService.Echo (EchoComponent)", `unexpected: ${res.message}`);
    }
  } catch (error) {
    fail("EchoService.Echo (EchoComponent)", error);
  }

  // Component-bound (TimeComponent): TimeService.GetTime
  try {
    const client = createClient(TimeService, transport);
    const res = await client.getTime(create(GetTimeRequestSchema, { timezone: "UTC" }));

    if (res.timestamp && res.timezone) {
      pass("TimeService.GetTime (TimeComponent)", `ts=${res.timestamp}, tz=${res.timezone}`);
    } else {
      fail("TimeService.GetTime (TimeComponent)", "empty response");
    }
  } catch (error) {
    fail("TimeService.GetTime (TimeComponent)", error);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Testing all endpoints on %s", BASE_URL);

  await testRestEndpoints();
  await testGrpcEndpoints();

  console.log("\n" + "=".repeat(50));
  if (hasFailure) {
    console.error("Some tests FAILED");
    process.exit(1);
  } else {
    console.log("All tests PASSED");
  }
}

main().catch((err) => {
  console.error("Client error:", err);
  process.exit(1);
});
