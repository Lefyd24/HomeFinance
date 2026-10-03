# Releasing

For maintainers. Pushing a version tag publishes a multi-arch Docker image to GitHub Container Registry and creates a GitHub Release, all from `.github/workflows/release.yml`.

## What a release produces

| Output | Where |
|---|---|
| Image `ghcr.io/lefyd24/personalfinance:1.2.0` | GitHub Packages. Built for `linux/amd64` and `linux/arm64`. |
| Moving tags `1.2` and `latest` | Same package. `latest` is only moved by stable releases, never by pre-releases. |
| GitHub Release with notes | The matching section of `CHANGELOG.md` plus GitHub's generated notes, and a `docker pull` line. Tags containing `-` (for example `v1.3.0-rc1`) are marked as pre-releases. |

## Versioning

[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **PATCH**: fixes only, no new settings and no migrations.
- **MINOR**: new features, new optional settings, or additive migrations.
- **MAJOR**: anything that needs manual action when updating, or removes a setting.

## Cutting a release

1. Make sure `main` is green in CI.
2. Update `CHANGELOG.md`: rename `## [Unreleased]` content to a new `## [X.Y.Z] - YYYY-MM-DD` section, add a fresh empty `[Unreleased]`, and fix the compare links at the bottom. Call out new migrations, new `.env` settings and anything users must do.
3. Bump the version in **all three places**, which must match the tag:
   - `pyproject.toml` (`version`)
   - `backend/app/config.py` (`APP_VERSION`)
   - `frontend/app/package.json` (`version`), and the top of `package-lock.json`
4. Refresh the Python lockfile, because the Docker build uses `uv sync --locked` and fails if it is stale:

   ```bash
   uv lock
   ```

5. Commit and push:

   ```bash
   git commit -am "chore: release vX.Y.Z"
   git push
   ```

6. Tag and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

7. Watch the **Release** workflow in the Actions tab. It verifies that the tag matches the three version files, runs the backend tests, builds and pushes the image, and creates the release. The arm64 build runs under emulation, so allow 10 to 20 minutes.

If the version check fails, fix the files, delete the tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`) and tag again.

## First release only

- After the first push, the package is created as **private**. Open the repository's **Packages** section, choose the package, then **Package settings**, and set visibility to **Public** so anyone can pull it without logging in.
- In the repository's **Settings → Actions → General**, make sure workflows have permission to create releases and push packages. The workflows request `contents: write` and `packages: write` themselves.
- Turn on **private vulnerability reporting** under **Settings → Code security**. [`security.md`](security.md) points reporters there.

## Pre-releases

Use a suffix to try a build without touching `latest`:

```bash
git tag -a v1.3.0-rc1 -m "v1.3.0-rc1"
git push origin v1.3.0-rc1
```

The version files must say `1.3.0` (the part before the `-`). Testers run it with `PF_IMAGE_TAG=1.3.0-rc1`.

## What not to bake into the image

The image is public, so it must not contain anything specific to you:

- No secrets: `.env`, keys and databases are excluded by `.dockerignore`, and `SECRET_KEY` has no default.
- No operator identity: the Privacy and Terms pages read `LEGAL_*` settings at runtime. Don't hardcode names or emails in the frontend.
