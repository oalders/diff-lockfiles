const chalk = require('chalk');
const semver = require('semver');

function diff(oldLock, newLock) {
  const changes = {};

  Object.entries(oldLock.dependencies).forEach(([name, { version }]) => {
    changes[name] = [version, null];
  });

  Object.entries(newLock.dependencies).forEach(([name, { version }]) => {
    if (changes[name]) {
      if (semver.eq(changes[name][0], version)) {
        delete changes[name];
      } else {
        changes[name] = [changes[name][0], version];
      }
    } else {
      changes[name] = [null, version];
    }
  });

  return changes;
}

function print(changes) {
  /* eslint-disable no-console */

  Object.entries(changes).forEach(([name, [oldVersion, newVersion]]) => {
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
  });

  /* eslint-enable no-console */
}

module.exports = {
  diff,
  print,
};
