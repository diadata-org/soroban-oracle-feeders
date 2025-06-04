// CommonJS wrapper for ESM-only wallet
module.exports = {
  getWallet: async function () {
    return await import('@midnight-ntwrk/wallet');
  },
  getIndexerPublicDataProvider: async function () {
    return await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  }
};
