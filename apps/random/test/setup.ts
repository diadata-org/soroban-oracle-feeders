import { beforeAll, afterEach, afterAll } from 'vitest';
import nock from 'nock';
import { setupNock } from './setupNock';

// Setup nock for API mocking
beforeAll(() => {
  setupNock();
});

// Clean up nock after each test
afterEach(() => {
  nock.cleanAll();
});

// Restore nock after all tests
afterAll(() => {
  nock.restore();
}); 
