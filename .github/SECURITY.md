# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub instead: go to the
[Security tab](https://github.com/Lefyd24/HomeFinance/security/advisories/new)
of this repository and choose **Report a vulnerability**. Only the maintainer
can see the report.

Include what you found, how to reproduce it, and which version or commit you
tested. You should get a reply within a week. Once a fix is released the
advisory is published and you are credited, unless you prefer otherwise.

## Supported versions

Only the latest release receives security fixes.

## Scope

Home Finance is self-hosted: each household runs its own instance. Reports
about the code in this repository are in scope. Misconfigured deployments
(for example a missing `SECRET_KEY`, or the port exposed without a proxy) are
covered in [docs/security.md](../docs/security.md) and
[docs/deployment.md](../docs/deployment.md).
