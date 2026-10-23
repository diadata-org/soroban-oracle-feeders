// Used only by Jest, to compile ESM-only dependencies down to CommonJS.
// @stellar/stellar-sdk's CommonJS build requires ESM-only packages (@noble/*,
// uint8array-extras). Node >= 22.12 supports require(esm) natively, so the
// applications are unaffected, but Jest's module registry does not.
// Application code itself is compiled by tsc, not Babel.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
