module.exports = {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], // Adjust based on your tests
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  transformIgnorePatterns: ['/node_modules/(?!(axios|graphql-request|opnet|@btc-vision|chalk|supports-color)/)'],
};
