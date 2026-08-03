/**
 * `next/headers` outside a request scope. Nothing under test reads these
 * today; they exist so an action that grows a `cookies()` call fails on
 * its own logic rather than on an unresolvable import.
 */
const empty = {
  get: () => undefined,
  getAll: () => [],
  has: () => false,
  set: () => {},
  delete: () => {},
  entries: () => [][Symbol.iterator](),
  [Symbol.iterator]: () => [][Symbol.iterator](),
};

module.exports = {
  __esModule: true,
  cookies: async () => empty,
  headers: async () => empty,
  draftMode: async () => ({ isEnabled: false, enable: () => {}, disable: () => {} }),
};
