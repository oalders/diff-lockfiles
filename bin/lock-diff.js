#!/usr/bin/env node

import { readFileSync } from 'fs';
import { Command } from 'commander';
import { diff, print } from '../lib/index.js';

const cli = new Command();

cli
  .version('0.9.0')
  .arguments('<oldPath> <newPath>')
  .option('-f, --format <format>', 'changes the output format', 'text')
  .option('-p, --pretty', 'improves readability of certain output formats', false)
  .option('-c, --color', 'colorizes certain output formats', false)
  .action((oldPath, newPath, options) => {
    const oldLock = JSON.parse(readFileSync(oldPath));
    const newLock = JSON.parse(readFileSync(newPath));

    const changes = diff(oldLock, newLock);

    print(changes, {
      format: options.format,
      pretty: options.pretty,
      color: options.color,
    });

    if (Object.keys(changes).length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .parse();
