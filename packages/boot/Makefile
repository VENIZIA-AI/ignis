# tsc writes 0644, so a rebuilt `bin` target is not executable until the next `bun install`.
POST_BUILD := chmod +x dist/esm/clis/*.js

include ../../make/project.mk
