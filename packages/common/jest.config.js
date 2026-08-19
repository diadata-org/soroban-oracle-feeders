module.exports = {
  transform: {
    '^.+\\.[tj]sx?$': '<rootDir>/../../jest-cjs-transformer.cjs',
  },
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'], // Make sure this is specific to your intended test files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  transformIgnorePatterns: [],
};
