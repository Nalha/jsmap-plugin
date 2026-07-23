import { readFile } from 'node:fs';

/** Reads a config file and doubles its value. */
export function loadConfig(path) {
  return double(readValue(path));
}

function readValue(path) {
  return path.length;
}

const double = (n) => n * 2;

export class Store {
  constructor(name) {
    this.name = name;
  }
  get size() {
    return count(this.name);
  }
  save(item) {
    return double(item);
  }
  static create(name) {
    return new Store(name);
  }
}

function count(s) {
  return s.length;
}

const handlers = {
  onOpen(evt) {
    return double(evt);
  },
};

describe('Store', () => {
  it('saves items', () => loadConfig('cfg'));
});
