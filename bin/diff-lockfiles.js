#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { diff, print } from '../lib/index.js';

const execPromise = promisify(exec);
const version = '1.0.2';

async function lockFiles(a, b) {
    const output = await execPromise(`git diff ${a} ${b} --name-only | grep 'package-lock.json$'`);
    const lines = output.stdout;
    const list = lines.trim().split(/\r\n|\r|\n/);

    return list;
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
    .option('-f, --format <format>', 'changes the output format (table|json|text)', 'table')
    .option('-m, --max-buffer', 'maximum read buffer size', 1024 * 10000)
    .option('-c, --color', 'colorizes certain output formats', false)
    .action((from, to, options) => {
        lockFiles(from, to).then((v) => {
            for (let filename of v) {
                const a = lockFileString(options.maxBuffer, from, filename).then((s) => { return JSON.parse(s); });
                const b = lockFileString(options.maxBuffer, to, filename).then((s) => { return JSON.parse(s); });
                Promise.all([a, b]).then((values) => {
                    const changes = diff(values[0], values[1]);
                    print(changes, {
                        color: options.color,
                        format: options.format,
                        title: filename,
                    });
                });
            }
        });
    })
    .parse();
