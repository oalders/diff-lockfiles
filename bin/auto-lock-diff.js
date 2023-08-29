#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { diff, print } from '../lib/index.js';

const execPromise = promisify(exec);

const lockFiles = async function getLockChangedLockFiles(a, b) {
    const output = await execPromise(`git diff ${a} ${b} --name-only | grep package-lock.json`);
    const lines = output.stdout;
    const list = lines.trim().split(/\r\n|\r|\n/);

    if (output.stderr.trim !== '') {
        // console.error(output.stderr.trim);
    }

    return list;
};

const lockFileString = async function getLockFileString(maxBuffer, branch, filename) {
    const output = await execPromise(`git show ${branch}:${filename}`, { maxBuffer: maxBuffer });
    const lines = output.stdout.trim();

    if (output.stderr.trim() !== '') {
        console.error(output.stderr.trim());
    }

    return lines;
};

const cli = new Command();
cli
    .command('auto-lock-diff.js')
    .description('diff all changed package-lock.json files in repo')
    .version('0.9.0')
    .arguments('<oldPath> <newPath>')
    .option('-f, --format <format>', 'changes the output format', 'text')
    .option('-m, --max-buffer', 'maximum read buffer size', 1024 * 10000)
    .option('-p, --pretty', 'improves readability of certain output formats', false)
    .option('-c, --color', 'colorizes certain output formats', false)
    .action((oldPath, newPath, options) => {
        lockFiles(oldPath, newPath).then((v) => {
            for (let filename of v) {
                const a = lockFileString(options.maxBuffer, oldPath, filename).then((s) => { return JSON.parse(s); });
                const b = lockFileString(options.maxBuffer, newPath, filename).then((s) => { return JSON.parse(s); });
                Promise.all([a, b]).then((values) => {
                    const changes = diff(values[0], values[1]);
                    print(changes, {
                        color: options.color,
                        format: options.format,
                        pretty: options.pretty,
                        title: filename,
                    });
                });
            }
        });
    })
    .parse();