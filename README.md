# Ignis Framework

Welcome to Ignis, a powerful and extensible backend framework for TypeScript, built on top of [Hono](https://hono.dev/). It is designed to be modular, scalable, and easy to use, providing a solid foundation for building modern, high-performance web applications and APIs.

## Core Concepts

Ignis is built around a few core concepts that make it flexible and powerful:

- **Dependency Injection:** The framework uses a custom, lightweight dependency injection container inspired by InversifyJS. This allows for loose coupling and better testability of your code.
- **Component-Based Architecture:** Functionality is organized into reusable **Components**. Each component encapsulates a specific feature (e.g., Authentication, Swagger UI, Socket.IO) and can be easily registered with the application.
- **Controllers, Services, and Repositories:** The framework follows a classic layered architecture pattern:
  - **Controllers** handle incoming HTTP requests.
  - **Services** contain the core business logic.
  - **Repositories** abstract data access and interact with DataSources.
- **Metadata and Decorators:** Ignis uses decorators (`@controller`, `@inject`, etc.) to define metadata for routing, dependency injection, and more, keeping your code clean and declarative.

# Philosophy: The Best of Two Worlds

Ignis was born from a simple yet powerful idea: to combine the structured, enterprise-grade development experience of **LoopBack 4** with the speed, simplicity, and modern JavaScript ecosystem of **Hono**.

## The LoopBack 4 Inspiration

[LoopBack 4](https://loopback.io/doc/en/lb4/index.html) is renowned for its opinionated, convention-over-configuration approach. It provides a solid architectural foundation based on key patterns:

- **Dependency Injection (DI):** A robust DI container that promotes loosely coupled, testable, and maintainable code.
- **Layered Architecture:** A clear separation of concerns with Controllers, Services, and Repositories.
- **Component-Based Extensibility:** A modular way to add new features and functionalities.
- **Decorators:** A clean, declarative way to define metadata for routing, dependency injection, and models.

These patterns are invaluable for building complex, large-scale applications that can be easily maintained and scaled by teams of developers.

## The Hono Advantage

[Hono](https://hono.dev/) is a small, simple, and ultrafast web framework for the edge. Its key advantages are:

- **Performance:** Hono is one of the fastest web frameworks available, making it ideal for high-performance APIs and serverless environments.
- **Lightweight:** It has a minimal core, which keeps applications small and fast to start.
- **Modern API:** It has a clean, modern, and intuitive API that is a pleasure to work with.
- **Multi-Runtime:** It runs on any JavaScript runtime, including Node.js, Bun, Deno, and Cloudflare Workers.

## Ignis: The Synthesis

[Ignis][https://github.com/VENIZIA-AI/ignis] brings the architectural rigor of LoopBack 4 to the high-performance Hono runtime. It provides:

- **A Familiar Structure:** Developers familiar with LoopBack or other enterprise frameworks will feel right at home with Ignis's layered architecture and DI system.
- **The Power of Hono:** Under the hood, Ignis leverages Hono's performance and flexibility, allowing you to build applications that are both robust and fast.
- **A Rich Ecosystem:** Ignis provides a set of pre-built components and helpers for common backend tasks, such as authentication, logging, database access, and more, all designed to work seamlessly with Hono.

In short, Ignis aims to be the framework of choice for developers who want to build structured, scalable, and maintainable applications without sacrificing the performance and simplicity of a modern web framework like Hono.
