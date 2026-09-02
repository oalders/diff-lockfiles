#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { diff, hasDowngrade, print } from '../lib/index.js';

const execFilePromise = promisify(execFile);
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Force the C locale on every git spawn so git's diagnostics come back in a
// stable, English wording. lockFileString() classifies a missing path by
// matching git's stderr text; under a translated locale that match would fail
// and a benign added/removed lockfile would surface as a hard error.
const gitEnv = { ...process.env, LC_ALL: 'C' };

async function lockFiles(a, b) {
    // Filter in JS rather than piping through grep: a pipeline masks a failing
    // `git diff` (e.g. a bad ref) behind grep's own exit code. Letting git's
    // failure reject here means a bad ref surfaces as an error, not a false
    // "no changed lockfiles".
    //
    // Pass the refs as an argument array via execFile (no shell), so a ref name
    // can never be interpreted as shell syntax (command injection). `--end-of-options`
    // then stops git from treating a ref that starts with `-` as an option
    // (e.g. `--output=…`); `--name-only` must precede the marker to stay an option.
    const output = await execFilePromise(
        'git', ['diff', '--name-only', '--end-of-options', a, b], { env: gitEnv });
    if (output.stderr.trim() !== '') {
        console.error(output.stderr.trim());
    }
    return output.stdout
        .trim()
        .split(/\r\n|\r|\n/)
        .filter((line) => /package-lock\.json$/.test(line));
};

// Return the file's contents at `ref`, or null when the file does not exist
// there (it was added or removed between the two refs).
async function lockFileString(maxBuffer, ref, filename) {
    try {
        const output = await execFilePromise(
            'git', ['show', '--end-of-options', `${ref}:${filename}`], { maxBuffer, env: gitEnv });

        if (output.stderr.trim() !== '') {
            console.error(output.stderr.trim());
        }

        return output.stdout.trim();
    } catch (err) {
        // `git show ref:path` exits non-zero when the path is absent at that ref.
        // The refs themselves were already validated by the `git diff` above, so
        // treat a missing-path error as "not present at this ref" and let the
        // caller diff against an empty lockfile. Re-throw anything else.
        if (/does not exist|exists on disk/i.test(err.stderr ?? err.message ?? '')) {
            return null;
        }
        throw err;
    }
};

function parseLock(contents, filename) {
    if (contents === null) {
        return { packages: {} };
    }
    try {
        return JSON.parse(contents);
    } catch (err) {
        throw new Error(`Could not parse ${filename} as JSON: ${err.message}`, { cause: err });
    }
}

// Reject a non-numeric or non-positive --max-buffer up front. Left unchecked,
// parseInt yields NaN, which execFile silently coerces to its 1 MiB default and
// then truncates larger lockfiles mid-stream, producing a confusing JSON parse
// error far from the real cause.
function parseMaxBuffer(value) {
    const bytes = parseInt(value, 10);
    if (!Number.isFinite(bytes) || bytes <= 0) {
        throw new InvalidArgumentError('must be a positive integer number of bytes.');
    }
    return bytes;
}

const cli = new Command();
cli
    .command('diff-lockfiles')
    .description('diff all changed package-lock.json files in repo')
    .version(version)
    .arguments('<from> <to>')
    .option('-f, --format <format>', 'changes the output format (table|json|markdown|text)', 'table')
    .option('-m, --max-buffer <bytes>', 'maximum read buffer size in bytes', parseMaxBuffer, 1024 * 10000)
    .option('-c, --color', 'colorizes certain output formats', false)
    .option('-s, --shallow', 'only include direct dependencies of the project', false)
    .option('-d, --fail-on-downgrade', 'exit 2 if any package version is decremented', false)
    .action(async (from, to, options) => {
        const filenames = await lockFiles(from, to);
        let downgradeFound = false;

        for (const filename of filenames) {
            const oldLock = parseLock(await lockFileString(options.maxBuffer, from, filename), filename);
            const newLock = parseLock(await lockFileString(options.maxBuffer, to, filename), filename);
            const changes = diff(oldLock, newLock, options.shallow);

            if (hasDowngrade(changes)) {
                downgradeFound = true;
            }

            print(changes, {
                color: options.color,
                format: options.format,
                title: filename,
            });
        }

        if (options.failOnDowngrade && downgradeFound) {
            process.exitCode = 2;
        }
    })
    .parseAsync()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
