# Testing Guide

This project uses Vitest for testing with comprehensive mocking of external dependencies.

## Running Tests

### All Tests
```bash
yarn test
```

## Test Structure

- `test/setup.ts` - Global test setup and teardown
- `test/setupNock.ts` - API mocking configuration
- `src/test/*.test.ts` - Individual oracle tests

## Test Coverage

The test suite covers:
- ✅ Function initialization and setup
- ✅ Error handling and edge cases
- ✅ Retry logic for failed operations
- ✅ Mocking of external dependencies (Stellar SDK, @repo/common)
- ✅ Transaction simulation and submission
- ✅ Data transformation and validation

## Mocking Strategy

- **Stellar SDK**: All Stellar SDK functions are mocked to avoid network calls
- **@repo/common**: Common utilities are mocked for isolated testing
- **Configuration**: Config values are mocked for consistent test environment
- **API Calls**: External API calls are mocked using nock

## Adding New Tests

1. Create a new test file: `src/test/[oracle-name].test.ts`
2. Import and mock necessary dependencies
3. Test all exported functions with various scenarios
4. Include error cases and edge conditions

## Example Test Structure

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('external-library');

describe('oracle-name', () => {
  beforeEach(() => {
    // Setup mocks
  });

  afterEach(() => {
    // Cleanup
  });

  describe('function-name', () => {
    it('should work correctly', () => {
      // Test implementation
    });

    it('should handle errors', () => {
      // Error case
    });
  });
});
``` 
