import { diff } from '../lib/index.js';

describe('diff', () => {
  it('returns an empty object when given two empty objects', () => {
    const oldLock = {
      packages: {},
    };

    const newLock = {
      packages: {},
    };

    const changes = diff(oldLock, newLock);

    expect(changes).toEqual({});
  });
});
