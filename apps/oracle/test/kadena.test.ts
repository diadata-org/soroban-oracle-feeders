import { Pact, createClient, createSignWithKeypair, ICommandResult } from '@kadena/client';
import { submitKadenaTx } from '@repo/common';
import config from '../src/config';
import { splitIntoFixedBatches } from '../src/utils';
import { updateOracle } from '../src/oracles/kadena';

jest.mock('@kadena/client');
jest.mock('@repo/common');
jest.mock('../src/config', () => ({
  kadena: {
    publicKey: 'mockPublicKey',
    secretKey: 'mockSecretKey',
    rpcUrl: 'http://mock-kadena-rpc-url',
    contract: 'mockContract',
    chainId: '0',
    networkId: 'testnet04',
    maxAssetsPerTx: 10,
    maxRetryAttempts: 3,
  },
}));
jest.mock('../src/utils', () => ({
  splitIntoFixedBatches: jest.fn(),
}));

describe('Kadena Oracle - updateOracle', () => {
  const mockClient = { someClientMethod: jest.fn() };
  const mockSignWithKeypair = jest.fn();
  const mockUnsignedTx = { tx: 'mockUnsignedTransaction' };
  const mockSignedTx = { some: 'signedTransaction' };
  const mockPactBuilder = {
    execution: jest.fn().mockReturnThis(),
    addSigner: jest.fn().mockReturnThis(),
    setMeta: jest.fn().mockReturnThis(),
    setNetworkId: jest.fn().mockReturnThis(),
    createTransaction: jest.fn().mockReturnValue(mockUnsignedTx),
  };

  beforeAll(() => {
    (createClient as jest.Mock).mockReturnValue(mockClient);
    (createSignWithKeypair as jest.Mock).mockReturnValue(mockSignWithKeypair);
    mockSignWithKeypair.mockResolvedValue(mockSignedTx);

    // Mock Pact.builder
    (Pact as any).builder = mockPactBuilder;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (submitKadenaTx as jest.Mock).mockResolvedValue('Success');

    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    await updateOracle(keys, prices);

    expect(createClient).toHaveBeenCalledWith('http://mock-kadena-rpc-url/chainweb/0.0/testnet04/chain/0/pact');
    expect(splitIntoFixedBatches).toHaveBeenCalledTimes(3); // For keys, dates, and prices
    expect(createSignWithKeypair).toHaveBeenCalledWith({
      publicKey: 'mockPublicKey',
      secretKey: 'mockSecretKey',
    });
    expect(mockSignWithKeypair).toHaveBeenCalledWith(expect.any(Object));
    expect(submitKadenaTx).toHaveBeenCalledWith(mockClient, mockSignedTx);
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    const submitKadenaTxMock = submitKadenaTx as jest.MockedFunction<typeof submitKadenaTx>;

    submitKadenaTxMock
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockResolvedValueOnce({} as ICommandResult);

    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    await updateOracle(keys, prices);

    expect(submitKadenaTxMock).toHaveBeenCalledTimes(2); // 1 failure, 1 success
  });

  it('should throw an error after max retry attempts are reached', async () => {
    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    const submitKadenaTxMock = submitKadenaTx as jest.MockedFunction<typeof submitKadenaTx>;

    submitKadenaTxMock.mockRejectedValue(new Error('Transaction failed'));

    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

    expect(submitKadenaTxMock).toHaveBeenCalledTimes(config.kadena.maxRetryAttempts);
  });
});
