// import { JSONRpcProvider, getContract } from 'opnet';
// import { updateOracle, init } from '../src/oracles/opnet';
// import { splitIntoFixedBatches } from '../src/utils';
// import config from '../src/config';

// // Mock necessary modules
// jest.mock('opnet', () => ({
//   JSONRpcProvider: jest.fn(),
//   getContract: jest.fn(),
// }));

// jest.mock('../src/utils', () => ({
//   splitIntoFixedBatches: jest.fn(),
// }));

// describe('OpNet Oracle - updateOracle', () => {
//   let mockProvider: JSONRpcProvider;
//   let mockContract: any;

//   beforeAll(() => {
//     // Initialize the OpNet environment
//     init();

//     // Mock JSONRpcProvider and contract
//     mockProvider = new JSONRpcProvider('https://testnet.opnet.org');
//     mockContract = {
//       setMultipleValues: jest.fn(),
//     };

//     (getContract as jest.Mock).mockReturnValue(mockContract);
//   });

//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   it('should successfully submit transactions for each batch', async () => {
//     const keys = ['key1', 'key2'];
//     const prices = [100, 200];

//     // Mock Date and utility functions
//     const mockDate = Date.now();
//     jest.spyOn(Date, 'now').mockReturnValue(mockDate);

//     (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

//     // Mock contract call
//     mockContract.setMultipleValues.mockResolvedValue('success');

//     await updateOracle(keys, prices);

//     expect(mockContract.setMultipleValues).toHaveBeenCalledWith(
//       ['key1', 'key2'],
//       [100_000_000, 200_000_000]
//     );
//   });

//   it('should retry transaction on failure and eventually succeed', async () => {
//     const keys = ['key1', 'key2'];
//     const prices = [100, 200];

//     // Mock Date and utility functions
//     const mockDate = Date.now();
//     jest.spyOn(Date, 'now').mockReturnValue(mockDate);

//     (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

//     // Mock contract call to fail once and then succeed
//     mockContract.setMultipleValues
//       .mockRejectedValueOnce(new Error('Transaction failed'))
//       .mockResolvedValueOnce('success');

//     await updateOracle(keys, prices);

//     expect(mockContract.setMultipleValues).toHaveBeenCalledTimes(2); // 1 failure, 1 success
//   });

//   it('should switch to the backup provider after first failure', async () => {
//     const keys = ['key1', 'key2'];
//     const prices = [100, 200];

//     // Mock Date and utility functions
//     const mockDate = Date.now();
//     jest.spyOn(Date, 'now').mockReturnValue(mockDate);

//     (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

//     // Mock contract call to fail on primary provider and then succeed on backup
//     mockContract.setMultipleValues
//       .mockRejectedValueOnce(new Error('Transaction failed'))
//       .mockResolvedValueOnce('success');

//     await updateOracle(keys, prices);

//     expect(mockContract.setMultipleValues).toHaveBeenCalledTimes(2);
//     expect(mockContract.setMultipleValues).toHaveBeenCalledWith(
//       ['key1', 'key2'],
//       [100_000_000, 200_000_000]
//     );
//   });

//   it('should throw an error after max retry attempts are reached', async () => {
//     const keys = ['key1', 'key2'];
//     const prices = [100, 200];

//     // Mock Date and utility functions
//     const mockDate = Date.now();
//     jest.spyOn(Date, 'now').mockReturnValue(mockDate);

//     (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

//     // Mock contract call to always fail
//     mockContract.setMultipleValues.mockRejectedValue(new Error('Transaction failed'));

//     await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

//     expect(mockContract.setMultipleValues).toHaveBeenCalledTimes(config.opnet.maxRetryAttempts);
//   });
// });
