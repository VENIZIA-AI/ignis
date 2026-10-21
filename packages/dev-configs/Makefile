FORMATS := plain
# The devz bin: tsc writes it without the execute bit, and node_modules/.bin/devz links to it.
POST_BUILD := chmod +x dist/cli/index.js

include ../../make/project.mk
