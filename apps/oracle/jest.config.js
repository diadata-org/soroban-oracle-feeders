module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], // Adjust based on your tests
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // ESM-only dependencies are compiled to CommonJS for Jest (see babel.config.js)
    '^.+\\.jsx?$': ['babel-jest', { rootMode: 'upward' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(axios|graphql-request|opnet|@btc-vision|chalk|supports-color|@stellar|@noble|uint8array-extras)/)'],
};
