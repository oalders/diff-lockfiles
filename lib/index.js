const chalk = require('chalk');
const semver = require('semver');

function diff (oldLock, newLock) {
  const changes = {};

  for (const [name, { version }] of Object.entries(oldLock.dependencies)) {
    changes[name] = [version, null];
  }

  for (const [name, { version }] of Object.entries(newLock.dependencies)) {
    if (changes[name]) {
      if (semver.eq(changes[name][0], version)) {
        delete changes[name];
      } else {
        changes[name] = [changes[name][0], version];
      }
    } else {
      changes[name] = [null, version];
    }
  }

  return changes;
}

function print (changes) {
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

module.exports = {
  diff,
  print,
};