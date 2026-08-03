/**
 * `next/navigation` outside a request scope.
 *
 * Next's own `redirect` works by throwing — the harness keeps that
 * contract so control flow through an action is unchanged, and carries
 * the destination on the error so a scenario can assert where the action
 * meant to send the user. `createEventFromForm`'s only success signal is
 * its redirect to /trips/<slug>/schedule.
 */

class HarnessRedirect extends Error {
  constructor(url, type) {
    super(`NEXT_REDIRECT ${url}`);
    this.name = 'HarnessRedirect';
    this.url = url;
    this.type = type ?? 'replace';
  }
}

class HarnessNotFound extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'HarnessNotFound';
  }
}

module.exports = {
  __esModule: true,
  HarnessRedirect,
  HarnessNotFound,
  redirect: (url, type) => {
    throw new HarnessRedirect(url, type);
  },
  permanentRedirect: (url) => {
    throw new HarnessRedirect(url, 'permanent');
  },
  notFound: () => {
    throw new HarnessNotFound();
  },
  RedirectType: { push: 'push', replace: 'replace' },
};
