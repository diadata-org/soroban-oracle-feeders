module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], // Make sure this is specific to your intended test files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  transformIgnorePatterns: ['/node_modules/(?!(axios|graphql-request)/)'],
};
