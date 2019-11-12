#!/usr/bin/env node

const fs = require('fs');
const commander = require('commander');
const { diff, print } = require('../lib/index');

commander
  .version('0.1.0')
  .arguments('<oldPath> <newPath>')
  .option('-f, --format <format>', 'changes the output format', 'text')
  .action((oldPath, newPath) => {
    const oldLock = JSON.parse(fs.readFileSync(oldPath));
    const newLock = JSON.parse(fs.readFileSync(newPath));

    const changes = diff(oldLock, newLock);
    
    switch (commander.format) {
      case 'json':
        console.log(JSON.stringify(changes, null, 2));
        break;
      case 'text':
      default:
        print(changes);
        break;
    }

    if (Object.keys(changes).length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .parse(process.argv);