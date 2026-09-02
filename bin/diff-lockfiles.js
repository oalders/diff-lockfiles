#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { diff, hasDowngrade, print } from '../lib/index.js';

const execPromise = promisify(exec);
const version = '1.0.2';

async function lockFiles(a, b) {
    // Filter in JS rather than piping through grep: a pipeline masks a failing
    // `git diff` (e.g. a bad ref) behind grep's own exit code. Letting git's
    // failure reject here means a bad ref surfaces as an error, not a false
    // "no changed lockfiles".
    const output = await execPromise(`git diff ${a} ${b} --name-only`);
    return output.stdout
        .trim()
        .split(/\r\n|\r|\n/)
        .filter((line) => /package-lock\.json$/.test(line));
};

async function lockFileString(maxBuffer, branch, filename) {
    const output = await execPromise(`git show ${branch}:${filename}`, { maxBuffer: maxBuffer });
    const lines = output.stdout.trim();

    if (output.stderr.trim() !== '') {
        console.error(output.stderr.trim());
    }

    return lines;
};

const cli = new Command();
cli
    .command('diff-lockfiles')
    .description('diff all changed package-lock.json files in repo')
    .version(version)
    .arguments('<from> <to>')
    .option('-f, --format <format>', 'changes the output format (table|json|markdown|text)', 'table')
    .option('-m, --max-buffer', 'maximum read buffer size', 1024 * 10000)
    .option('-c, --color', 'colorizes certain output formats', false)
    .option('-s, --shallow', 'only include direct dependencies of the project', false)
    .option('-d, --fail-on-downgrade', 'exit 2 if any package version is decremented', false)
    .action(async (from, to, options) => {
        const filenames = await lockFiles(from, to);
        let downgradeFound = false;

        for (const filename of filenames) {
            const oldLock = JSON.parse(await lockFileString(options.maxBuffer, from, filename));
            const newLock = JSON.parse(await lockFileString(options.maxBuffer, to, filename));
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
