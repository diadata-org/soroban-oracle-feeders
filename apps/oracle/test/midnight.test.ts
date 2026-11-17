import { connectMidnightOracle } from '@repo/common';
import config from '../src/config';
import {
  batchLayouts,
  init,
  isTimeToDismissRejection,
  updateOracle,
} from '../src/oracles/midnight';

jest.mock('@repo/common', () => ({
  MIDNIGHT_BATCH_SIZE: 10,
  connectMidnightOracle: jest.fn(),
}));
jest.mock('../src/config', () => ({
  ChainName: {
    Midnight: 'midnight',
  },
  midnight: {
    maxRetryAttempts: 3,
    retryDelayMs: 0,
  },
}));

const keysOf = (layout: [string, unknown][]) => layout.map(([key]) => key);

// The node error as it reaches the feeder: Midnight.js' ProviderFailedError, the wallet's and the
// node client's SubmissionError, and the node's own RPC error.
const withCause = (message: string, cause?: Error) => Object.assign(new Error(message), { cause });
const timeToDismissRejection = () =>
  withCause(
    "submitTx rejected the transaction (circuit 'set_multiple_values')",
    withCause(
      'SubmissionError: Transaction submission error',
      withCause(
        'SubmissionError: Transaction submission failed',
        withCause('Error: 1010: Invalid Transaction: Custom error: 231'),
      ),
    ),
  );

describe('Midnight Oracle - updateOracle', () => {
  const mockClient = {
    setMultipleValues: jest.fn(),
  };

  beforeAll(() => {
    (connectMidnightOracle as jest.Mock).mockResolvedValue(mockClient);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    mockClient.setMultipleValues.mockResolvedValue({ txId: 'mockTxId', blockHeight: 1 });

    await updateOracle(['key1', 'key2'], [100, 200]);

    const [batch] = mockClient.setMultipleValues.mock.calls[0];
    expect(batch).toHaveLength(10);
    expect(batch.slice(0, 2)).toEqual([
      ['key1', { value: BigInt(100 * 100_000_000), timestamp: expect.any(BigInt) }],
      ['key2', { value: BigInt(200 * 100_000_000), timestamp: expect.any(BigInt) }],
    ]);
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    mockClient.setMultipleValues
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockResolvedValueOnce({ txId: 'mockTxId', blockHeight: 1 });

    await updateOracle(['key1', 'key2'], [100, 200]);

    expect(mockClient.setMultipleValues).toHaveBeenCalledTimes(2); // 1 failure, 1 success
  });

  it('should throw an error after max retry attempts are reached', async () => {
    mockClient.setMultipleValues.mockRejectedValue(new Error('Transaction failed'));

    await expect(updateOracle(['key1', 'key2'], [100, 200])).rejects.toThrow('Transaction failed');

    expect(mockClient.setMultipleValues).toHaveBeenCalledTimes(config.midnight.maxRetryAttempts);
  });

  it('resends a batch the node rejects with custom error 231 in another layout, without using a retry', async () => {
    const keys = Array.from({ length: 22 }, (_, i) => `A${i}/USD`);
    mockClient.setMultipleValues
      .mockResolvedValueOnce({ txId: 'batch1', blockHeight: 1 })
      .mockResolvedValueOnce({ txId: 'batch2', blockHeight: 2 })
      .mockRejectedValueOnce(timeToDismissRejection())
      .mockResolvedValueOnce({ txId: 'batch3', blockHeight: 3 });

    await updateOracle(
      keys,
      keys.map((_, i) => i + 1),
    );

    const calls = mockClient.setMultipleValues.mock.calls.map(([batch]) => keysOf(batch));
    expect(calls).toHaveLength(4);
    expect(calls[2].slice(0, 2)).toEqual(['A20/USD', 'A21/USD']);
    expect(calls[3]).not.toEqual(calls[2]);
    expect(new Set(calls[3].slice(0, 2))).toEqual(new Set(['A20/USD', 'A21/USD']));
  });
});

describe('batchLayouts', () => {
  const entry = (key: string): [string, any] => [key, { value: 1n, timestamp: 1n }];
  const round = Array.from({ length: 22 }, (_, i) => entry(`K${i}`));

  it('fills a short batch with other entries of the round, not its last entry repeated', () => {
    const [first] = batchLayouts(round.slice(20), round);
    expect(keysOf(first)).toHaveLength(10);
    expect(keysOf(first).slice(0, 2)).toEqual(['K20', 'K21']);
    expect(new Set(keysOf(first)).size).toBe(10);
  });

  it('offers distinct alternative layouts that always contain the whole batch', () => {
    const layouts = batchLayouts(round.slice(20), round);
    expect(layouts.length).toBe(4);
    expect(new Set(layouts.map((l) => keysOf(l).join('|'))).size).toBe(4);
    for (const layout of layouts) {
      expect(keysOf(layout)).toEqual(expect.arrayContaining(['K20', 'K21']));
      expect(layout).toHaveLength(10);
    }
  });

  it('repeats the batch itself when the round has nothing else', () => {
    const small = [entry('BTC'), entry('ETH')];
    const [first] = batchLayouts(small, small);
    expect(keysOf(first)).toEqual([
      'BTC',
      'ETH',
      'BTC',
      'ETH',
      'BTC',
      'ETH',
      'BTC',
      'ETH',
      'BTC',
      'ETH',
    ]);
  });
});

describe('isTimeToDismissRejection', () => {
  it('finds the node error in the cause chain', () => {
    expect(isTimeToDismissRejection(timeToDismissRejection())).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isTimeToDismissRejection(new Error('Transaction failed'))).toBe(false);
    expect(
      isTimeToDismissRejection(
        withCause('submit', withCause('1010: Invalid Transaction: Custom error: 138')),
      ),
    ).toBe(false);
  });
});
