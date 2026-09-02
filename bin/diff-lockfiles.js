#!/usr/bin/env node

import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { diff, hasDowngrade, print } from '../lib/index.js';

const execFilePromise = promisify(execFile);
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

async function lockFiles(a, b) {
    // Filter in JS rather than piping through grep: a pipeline masks a failing
    // `git diff` (e.g. a bad ref) behind grep's own exit code. Letting git's
    // failure reject here means a bad ref surfaces as an error, not a false
    // "no changed lockfiles".
    //
    // Pass the refs as an argument array via execFile (no shell), so a ref name
    // can never be interpreted as shell syntax (command injection).
    const output = await execFilePromise('git', ['diff', a, b, '--name-only']);
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
            'git', ['show', `${ref}:${filename}`], { maxBuffer });

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

const cli = new Command();
cli
    .command('diff-lockfiles')
    .description('diff all changed package-lock.json files in repo')
    .version(version)
    .arguments('<from> <to>')
    .option('-f, --format <format>', 'changes the output format (table|json|markdown|text)', 'table')
    .option('-m, --max-buffer <bytes>', 'maximum read buffer size in bytes', (value) => parseInt(value, 10), 1024 * 10000)
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
