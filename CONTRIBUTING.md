# Contributing to IGNIS

The full workflow (setup, branches, commits, pull requests, review) is one page:
[Contribution Workflow](https://ignis.venizia.ai/best-practices/contribution-workflow).

The four rules to know before you open a pull request:

1. **Issue first.** Open an issue in `VENIZIA-AI/ignis` before you write code.
2. **Branch from `develop`.** Name it `feature/*`, `fix/*`, `docs/*`, `chore/*` or `test/*`. Never commit to `develop` or `main`.
3. **Commit as `[#N] type(scope): subject`**, with `#N` the issue and a Conventional Commits type, for example `[#123] fix(helpers): encode the copy source`.
4. **Open the pull request against `develop`** (`gh pr create --base develop`). Put `Refs #N` in the description; the maintainers close the issue after the release.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
