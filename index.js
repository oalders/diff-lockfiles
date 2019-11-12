#!/usr/bin/env node

const chalk = require('chalk');
const semver = require('semver');
const commander = require('commander');

function diff (oldPath, newPath) {
  const oldLock = require(`./${oldPath}`);
  const newLock = require(`./${newPath}`);

  const changes = {};

  for (const [name, { version }] of Object.entries(oldLock.dependencies)) {
    changes[name] = [version, null];
  }

  for (const [name, { version }] of Object.entries(newLock.dependencies)) {
    if (changes[name]) {
      changes[name] = [changes[name][0], version];
    } else {
      changes[name] = [null, version];
    }
  }

  for (const [name, [oldVersion, newVersion]] of Object.entries(changes)) {
    if (!oldVersion) {

      console.log(`${name} ${chalk.red('removed')}`);

    } else if (!newVersion) {

      console.log(`${name} ${chalk.green('added')}`);
    
    } else if (!semver.eq(oldVersion, newVersion)) {

      const color = semver.gt(oldVersion, newVersion)
        ? chalk.red
        : chalk.green;

      console.log(`${name} ${color(`${oldVersion} -> ${newVersion}`)}`);
    
    }
  }
}

commander
  .version('0.1.0')
  .arguments('<oldPath> <newPath>')
  .action(diff)
  .parse(process.argv);