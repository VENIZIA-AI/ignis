# {{app}}: a compiled IGNIS binary on Alpine. Build from the project root:
#   docker build -f {{appPath}}/.configs/builders/Dockerfile -t {{app}} \
#     --build-arg APP_BUILD_COMMIT="$(git rev-parse HEAD)" \
#     --build-arg APP_BUILD_BRANCH="$(git rev-parse --abbrev-ref HEAD)" .
# The whole project is the build context (trimmed by the root .dockerignore), because the preset
# cannot know which workspace packages the app imports. List them by hand for better layer caching.

FROM docker.io/oven/bun:1.4.3-alpine AS base

# A private npm mirror, if the build has no access to the public registry.
ARG BUN_CONFIG_REGISTRY=
ENV BUN_CONFIG_REGISTRY=${BUN_CONFIG_REGISTRY}

WORKDIR /home/bun/project
RUN chown bun:bun /home/bun/project
USER bun

# -------------------------------------------------------------------------------
# Build stage: install the workspace, compile the app to dist/bin
# -------------------------------------------------------------------------------
FROM base AS builder

# The image has no .git, so the build stamp reads the commit and the branch from these. A build
# without the commit stops here: an image must always say which commit it runs.
ARG APP_BUILD_COMMIT=
ARG APP_BUILD_BRANCH=
ARG APP_BUILD_VERSION=
RUN test -n "$APP_BUILD_COMMIT" || { echo "Pass --build-arg APP_BUILD_COMMIT=\$(git rev-parse HEAD)" >&2; exit 1; }

COPY --chown=bun . .
# A .env in the context puts its secrets in the layer above: refuse the build and name the files.
RUN leaked="$(find . -name '.env*' ! -name '.env.example' -not -path '*/node_modules/*')"; \
    if [ -n "$leaked" ]; then \
      echo "Secrets in the build context: $leaked - add **/.env and **/.env.* to the root .dockerignore" >&2; \
      exit 1; \
    fi
RUN bun install --frozen-lockfile --ignore-scripts

WORKDIR /home/bun/project/{{appPath}}
# Alpine is musl: the binary targets bun-linux-<arch>-musl, for the architecture the image builds on.
RUN BUN_TARGET="bun-linux-$([ "$(uname -m)" = aarch64 ] && echo arm64 || echo x64)-musl" bun run compile

# -------------------------------------------------------------------------------
# Production stage: the binary alone
# -------------------------------------------------------------------------------
FROM docker.io/alpine:3.21 AS production

ARG APP_BUILD_COMMIT=
LABEL org.opencontainers.image.revision="${APP_BUILD_COMMIT}"

# A Bun binary links libstdc++ and libgcc dynamically on musl.
COPY --from=builder /usr/lib/libstdc++.so.6* /usr/lib/
COPY --from=builder /usr/lib/libgcc_s.so.1* /usr/lib/
RUN addgroup -S app && adduser -S app -G app

WORKDIR /home/app
USER app

COPY --from=builder --chown=app /home/bun/project/{{appPath}}/dist/bin ./bin

ENV HOST=0.0.0.0 PORT={{devPort}}
EXPOSE {{devPort}}

CMD ["./bin"]
