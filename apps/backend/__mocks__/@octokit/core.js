module.exports = {
  Octokit: class MockOctokit {
    constructor() {}
    request() {
      return Promise.resolve({});
    }
  },
};
