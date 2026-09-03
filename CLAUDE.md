# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`diff-lockfiles` is a CLI tool that diffs `package-lock.json` files across git commit ranges, showing which dependencies changed versions. Fork of [lock-diff](https://github.com/mxweaver/lock-diff). ES module project (`"type": "module"`).

## Commands

- **Test:** `NODE_OPTIONS=--experimental-vm-modules npm test` (the flag is required — Jest runs the ESM sources through `vm` modules)
- **Run single test:** `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/index.test.js`
- **Lint:** `npm run lint` (ESLint 9 flat config in `eslint.config.js`)
- **Run CLI:** `./bin/diff-lockfiles.js <from> <to>` (e.g., `./bin/diff-lockfiles.js HEAD~1 HEAD`). Flags: `-f/--format` (table|json|markdown|text, default table), `-c/--color`, `-s/--shallow`, `-d/--fail-on-downgrade`, `-m/--max-buffer <bytes>`.

Runs on Node 20+ (CI matrix: 20, 22, 24, 26).

## Architecture

- `bin/diff-lockfiles.js` — CLI entry point using Commander. Runs `git diff` to find changed lockfiles between two refs, parses them via `git show`, then calls `diff()` and `print()`.
- `lib/index.js` — Core logic. Exports `diff(oldLock, newLock, shallow)` which compares `.packages` entries using semver, `format(changes, options)` which returns formatted strings (table, json, markdown, or text), `print(changes, options)` which formats and writes to stdout, and `hasDowngrade(changes)` which reports whether any package version was decremented (drives the CLI's `--fail-on-downgrade` exit code). Color support via chalk.
- `__tests__/index.test.js` — Jest unit tests for `diff()`, `format()`, and `hasDowngrade()`.
- `__tests__/cli.test.js` — Jest integration tests for the CLI (spawns real git repos, checks exit codes and `--fail-on-downgrade`).
- `data/` — Fixture lockfiles (lodash version variants) for testing.

## Behavior & invariants

These span `bin/` + `lib/` and are easy to break inadvertently:

- **CLI flow:** the CLI diffs *every* changed `package-lock.json` in the ref range. For each file it `git show`s both sides, `JSON.parse`s them, calls `diff()`, and `print()`s the result with `title: filename` — this is why the formatters take a `title`. The exit code is set once, after all files.
- **Exit-code contract:** `0` = success; `1` = error (bad ref, unparseable lockfile); `2` = a downgrade was found *and* `--fail-on-downgrade` was passed. Output is identical with or without the flag — it only changes the exit code. A "downgrade" requires both sides to be valid semver with the new one lower; adds, removes, and non-semver values never count (see `hasDowngrade`). This drives Dependabot auto-merge gating (see README).
- **Missing lockfile at a ref** (added/removed between refs) is modeled as `{ packages: {} }`, i.e. all-added or all-removed — not an error. `bin` detects this by string-matching git's "does not exist" stderr, which is why git is spawned with `LC_ALL: 'C'` (a translated locale would break the match).
- **`diff()` fails closed:** it throws if either lockfile has no top-level `packages` map (npm lockfileVersion < 2). Returning an empty diff would be fail-open — a downgrade could slip past `--fail-on-downgrade`. An *empty-but-present* `packages` object is the allowed added/removed case above.
- **Untrusted input hardening:** package names come from lockfile contents. `diff()` accumulates into `Object.create(null)` so a package literally named `__proto__` stays a data key (there are tests for this). Git is always spawned via `execFile` with an argument array (never a shell) and `--end-of-options`, so a ref beginning with `-` can't be treated as an option or injected. Preserve these when touching `bin/diff-lockfiles.js`.
