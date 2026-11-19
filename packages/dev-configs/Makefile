FORMATS := plain
# The devz bin: tsc writes it without the execute bit, and node_modules/.bin/devz links to it.
POST_BUILD := chmod +x dist/cli/index.js

# The purity probe fixtures are deliberately impure (node builtins, process reads): linting them would fix the very thing they test.
# The codemod tests build their scratch projects under app_data; a lint run must not read a half-written one.
LINT_IGNORE := src/__tests__/checks/purity/fixtures/** app_data/**

include ../../make/project.mk
