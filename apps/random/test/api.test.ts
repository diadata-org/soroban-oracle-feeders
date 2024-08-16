import axios from 'axios';
import { fetchRandomValue, DrandResponse } from '../src/api'; // Adjust the path as necessary
import config from '../src/config';

jest.mock('axios');

describe('Randomness Oracle API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and validate the random value successfully', async () => {
    const mockResponseData = {
      round: 123456,
      randomness: 'abc123',
      signature: 'signature123',
      previous_signature: 'previousSignature123',
    };

    (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockResponseData });

    const result = await fetchRandomValue();

    expect(axios.get).toHaveBeenCalledWith(config.drandApiUrl);
    expect(result).toEqual(DrandResponse.parse(mockResponseData));  // Validate the result using the parse method
  });

  it('should throw an error if the API response is invalid', async () => {
    const invalidResponseData = {
      round: 'invalid_round',  // invalid round type
      randomness: 'abc123',
      signature: 'signature123',
      previous_signature: 'previousSignature123',
    };

    (axios.get as jest.Mock).mockResolvedValueOnce({ data: invalidResponseData });

    await expect(fetchRandomValue()).rejects.toThrow();  // Expect an error to be thrown due to invalid data
  });

  it('should handle network errors gracefully', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

    await expect(fetchRandomValue()).rejects.toThrow('Network Error');  // Ensure network errors are properly caught
  });
});
