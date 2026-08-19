module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], // Make sure this is specific to your intended test files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // ESM-only dependencies are compiled to CommonJS for Jest (see babel.config.js)
    '^.+\\.jsx?$': ['babel-jest', { rootMode: 'upward' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(axios|graphql-request|@stellar|@noble|uint8array-extras)/)'],
};
