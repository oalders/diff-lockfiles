# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`diff-lockfiles` is a CLI tool that diffs `package-lock.json` files across git commit ranges, showing which dependencies changed versions. Fork of [lock-diff](https://github.com/mxweaver/lock-diff). ES module project (`"type": "module"`).

## Commands

- **Test:** `NODE_OPTIONS=--experimental-vm-modules npm test`
- **Run single test:** `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/index.test.js`
- **Lint:** `npm run lint`
- **Run CLI:** `./bin/diff-lockfiles.js <from> <to>` (e.g., `./bin/diff-lockfiles.js HEAD~1 HEAD`)

## Architecture

- `bin/diff-lockfiles.js` — CLI entry point using Commander. Runs `git diff` to find changed lockfiles between two refs, parses them via `git show`, then calls `diff()` and `print()`.
- `lib/index.js` — Core logic. Exports `diff(oldLock, newLock, shallow)` which compares `.packages` entries using semver, `format(changes, options)` which returns formatted strings (table, json, markdown, or text), and `print(changes, options)` which formats and writes to stdout. Color support via chalk.
- `__tests__/index.test.js` — Jest tests for the `diff()` function.
- `data/` — Fixture lockfiles (lodash version variants) for testing.
