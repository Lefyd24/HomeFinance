# Contributing

Thanks for helping out. Issues and pull requests are welcome.

Found a security problem? Please don't open a public issue. See [SECURITY.md](.github/SECURITY.md).

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- [Development](docs/development.md) covers the architecture, local setup and conventions.

## Making a pull request

1. Branch from `main` and keep the PR to one change.
2. Run the tests locally. CI runs the same checks and a Docker build on every PR:

   ```bash
   DEBUG=true uv run pytest backend/tests
   cd frontend/app && npm run lint && npm run test && npm run build
   ```

3. Model changes need an Alembic migration. See [Migrations](docs/migrations.md#creating-a-migration-developers).
4. If the change is something users will notice, add a line to the changelog (below).
5. If `main` moves on while your PR is open, rebase on it.

## Changelog

`CHANGELOG.md` has an `## [Unreleased]` section at the top. Add your entry there, under `### Added`, `### Changed` or `### Fixed` (create the heading if it's missing), and end it with the PR number:

```markdown
## [Unreleased]

### Added
- Russian, French, German and Italian translations. (#60)
```

Write it for users: what changed for them, not how the code changed. Mention it if the PR adds a migration or a new `.env` setting.

**Needs an entry:** new features, bug fixes, behaviour changes, new translations.
**No entry:** refactors, tests, CI, docs, and routine dependency updates.

Don't bump version numbers or add a version heading. The maintainer does that when cutting a release, which gathers everything under `[Unreleased]` into the next version. Merging a PR doesn't publish anything by itself; see [Releasing](docs/releasing.md).

## Translations

Locale files live in `frontend/app/src/locales/<lang>/`, one JSON file per area. English (`en`) is the source.

- New keys go into both `en` and `el`. Other languages fall back to English for any key they're missing, so a partial translation is fine.
- Keep `{{placeholders}}` exactly as they are in English, e.g. `{{finalValue}}`, not `{{finalWert}}`. i18next only fills in a value when the name matches.
- Keep plural suffixes (`_one`, `_other`, …) on the keys.
- If you can't translate a string well, leave it out rather than machine-translating it word by word. It will show in English.
- A new language also needs registering in `frontend/app/src/i18n/config.ts` and `src/components/LanguageToggle.tsx`, plus its name under `languages` in `common.json`.

## Dependency updates

Dependabot opens weekly PRs. Minor and patch updates are grouped. Major updates come one at a time and are reviewed separately, since they can break things.
