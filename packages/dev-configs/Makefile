FORMATS := plain
# The devz bin: tsc writes it without the execute bit, and node_modules/.bin/devz links to it.
POST_BUILD := chmod +x dist/cli/index.js

# The purity probe fixtures are deliberately impure (node builtins, process reads): linting them would fix the very thing they test.
LINT_IGNORE := src/__tests__/checks/purity/fixtures/**

include ../../make/project.mk
