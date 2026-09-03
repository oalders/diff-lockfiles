# Change Log

## 1.3.0 - 2026-09-03

- Added --fail-on-downgrade (-d): exit 2 when any package version is
  decremented, exit 1 on error, exit 0 otherwise (GH #107)
- Added --max-buffer (-m) to set the maximum read buffer size in bytes
- Added a public `format()` export so the diff can be rendered
  programmatically (GH #98)
- Security: fixed a command-injection risk in git invocations and hardened git
  spawns (LC_ALL=C, --end-of-options, validated --max-buffer) (GH #111)
- Fixed --shallow crash and other lockfile edge cases: missing packages map now
  fails closed, and `__proto__` keys and null package descriptors are handled
  safely (GH #112)
- Hardened CI and publish: SHA-pinned actions, least-privilege permissions,
  checkouts no longer persist git credentials, and publish runs with
  --ignore-scripts (GH #113)
- Updated dependencies (chalk 6, commander 15, eslint 10, flatted 3.4)

## 1.2.1 - 2025-09-25

- Add markdown to --help output

## 1.2.0 - 2025-09-25

- Added markdown as a table format

## 1.1.0 - 2024-06-28

- Added --shallow to only handle direct dependencies (GH #31) (Jussi Kosunen)

## 1.0.3 - 2024-06-06

- Only diff files whose string *ends* with package-lock.json (GH #24 Tim
  Vergenz)

## 1.0.2 - 2023-09-07

- Default to table layout rather than text

## 1.0.1 - 2023-09-07

- Improve documentation

## 1.0.0 - 2023-09-06

- First release
