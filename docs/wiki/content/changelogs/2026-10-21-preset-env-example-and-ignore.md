---
title: The App Preset Lists Its Environment Keys and Ships Its Ignore Files
description: '.env.example names every APP_ENV key the app reads, the .ignore files come with the app, and the image refuses anything that is not a commit sha.'
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-21

## The app preset lists its environment keys and ships its ignore files

<Badge type="tip" text="Enhancement" />

**In one line.** An app from `vulcan add --preset ignis --app` gets a `.env.example` with every `APP_ENV_*` key it reads, and its `.ignore` files from the start.

## What changed

- **`.env.example`.** It lists the application (`APP_ENV_APPLICATION_NAME`, `APP_ENV_APPLICATION_TIMEZONE`), server (`APP_ENV_SERVER_HOST`, `APP_ENV_SERVER_PORT`) and logger keys (`APP_ENV_LOGGER_LEVEL`, `_FORMAT`, `_COLOR`, `_FOLDER_PATH`, `_FILE_FREQUENCY`, `_FILE_MAX_SIZE`, `_FILE_MAX_FILES`), each with a one-line comment. Copy it to `.env` for a local run.
- **The server keys work.** The app used to set `host` and `port` in code, so `APP_ENV_SERVER_HOST` and `APP_ENV_SERVER_PORT` did nothing. It now reads `HOST`, then `APP_ENV_SERVER_HOST`; and `PORT`, then `APP_ENV_SERVER_PORT`, then the dev port.
- **`.configs/lints/.ignore` and `.configs/formatters/.ignore`** ship with the app and every lib, holding only comments: what the file is for, the syntax and an example. Uncomment or add a line to skip a path.
- **The image refuses a value that is not a commit.** `APP_BUILD_COMMIT` must be a hex sha of 7 characters or more. Before a first commit, `git rev-parse HEAD` prints the word `HEAD`, which the image used to accept and stamp.

## Who is affected

| You have                                         | Do this                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An app made from `@venizia/ignis` 0.3.5 or older | Copy the new `.env.example`, the two `.ignore` files and the `APP_BUILD_COMMIT` check of `.configs/builders/Dockerfile` from a new app, if you want them |
| An image build that runs before the first commit | Commit first: `git add -A && git commit -m init`                                                                                                         |
