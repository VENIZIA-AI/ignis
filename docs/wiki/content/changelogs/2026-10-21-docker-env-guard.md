---
title: The App Image Refuses .env Files in Its Build Context
description: 'The generated Dockerfile stops when a .env file reaches the build context, so secrets never land in a builder layer.'
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-21

## The app image refuses `.env` files in its build context

<Badge type="danger" text="Security" />

**In one line.** The Dockerfile that `vulcan add --preset ignis --app` generates now fails the build when a `.env` file is in the build context, instead of copying its secrets into the builder layer.

## What changed

- **The leak.** The Dockerfile copies the whole project (`COPY . .`). The root `.dockerignore` written by VULCAN 0.3.6 does not exclude `.env` files, so every app's `.env` (database passwords, secrets) lands in the builder layer. The final image holds only the binary, but a CI layer cache can keep the builder layer.
- **The guard.** Right after the copy, the Dockerfile looks for any `.env*` file other than `.env.example`. If it finds one, the build stops, names the files and says which lines the `.dockerignore` needs.

## Who is affected

| You have                                                                   | Do this                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A project made by `vulcan init` with VULCAN 0.3.6 that builds an app image | Add `**/.env`, `**/.env.*` and `!**/.env.example` to the root `.dockerignore`. `vulcan doctor` 0.3.7 warns until you do |
| An app made from `@venizia/ignis` 0.3.4                                    | Copy the guard into `.configs/builders/Dockerfile`, after `COPY --chown=bun . .`, or recreate the file from 0.3.5       |
| A CI cache that ran a 0.3.4 image build with `.env` files present          | Clear the builder cache and rotate those secrets                                                                        |

```dockerfile
COPY --chown=bun . .
RUN leaked="$(find . -name '.env*' ! -name '.env.example' -not -path '*/node_modules/*')"; \
    if [ -n "$leaked" ]; then \
      echo "Secrets in the build context: $leaked - add **/.env and **/.env.* to the root .dockerignore" >&2; \
      exit 1; \
    fi
```
