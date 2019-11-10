const isEqual = require('lodash/isEqual');
const chalk = require('chalk');
const semver = require('semver');

const lockA = require('./data/lodash.4-17-14.package-lock.json');
const lockB = require('./data/lodash.4-17-15.package-lock.json');

const versions = {};

for (const [name, info] of Object.entries(lockA.dependencies)) {
  versions[name] = [info, null];
}

for (const [name, info] of Object.entries(lockB.dependencies)) {
  if (versions[name]) {
    versions[name] = [versions[name][0], info];
  } else {
    versions[name] = [null, info];
  }
}

for (const [name, [a, b]] of Object.entries(versions)) {
  if (!b) {
    console.log(`${name} ${chalk.red('removed')}`);
  } else if (!a) {
    console.log(`${name} ${chalk.green('added')}`);
  } else if (!semver.eq(a.version, b.version)) {
    const color = semver.gt(a.version, b.version) ? chalk.red : chalk.green;

    console.log(`${name} ${color(`${a.version} -> ${b.version}`)}`);
  }
}
