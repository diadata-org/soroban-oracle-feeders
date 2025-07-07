import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { DrandResponse } from '../src/api';
import * as api from '../src/api';

// Mock axios
vi.mock('axios');

// Mock config
vi.mock('../src/config', () => ({
  default: {
    drandApiUrl: 'https://api.drand.sh/public/latest',
  },
}));

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DrandResponse schema', () => {
    it('should validate correct DrandResponse data', () => {
      const validData = {
        round: 123,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      const result = DrandResponse.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate data with round 0', () => {
      const validData = {
        round: 0,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      const result = DrandResponse.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate data with very large round number', () => {
      const validData = {
        round: 999999,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      const result = DrandResponse.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should reject data with missing round', () => {
      const invalidData = {
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with missing randomness', () => {
      const invalidData = {
        round: 123,
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with missing signature', () => {
      const invalidData = {
        round: 123,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with missing previous_signature', () => {
      const invalidData = {
        round: 123,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with non-integer round', () => {
      const invalidData = {
        round: 123.5,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with non-string randomness', () => {
      const invalidData = {
        round: 123,
        randomness: 123,
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with non-string signature', () => {
      const invalidData = {
        round: 123,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: 123,
        previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });

    it('should reject data with non-string previous_signature', () => {
      const invalidData = {
        round: 123,
        randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
        signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
        previous_signature: 123,
      };

      expect(() => DrandResponse.parse(invalidData)).toThrow();
    });
  });

  describe('fetchRandomValue', () => {
    it('should fetch and parse valid random value successfully', async () => {
      const mockResponse = {
        data: {
          round: 123,
          randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
          signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
          previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
        },
      };

      (axios.get as any).mockResolvedValue(mockResponse);

      const result = await api.fetchRandomValue();

      expect(axios.get).toHaveBeenCalledWith('https://api.drand.sh/public/latest');
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw error when API returns invalid data', async () => {
      const mockResponse = {
        data: {
          round: 'invalid', // Should be a number
          randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
          signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
          previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
        },
      };

      (axios.get as any).mockResolvedValue(mockResponse);

      await expect(api.fetchRandomValue()).rejects.toThrow();
    });

    it('should throw error when API returns missing fields', async () => {
      const mockResponse = {
        data: {
          round: 123,
          randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
          // Missing signature and previous_signature
        },
      };

      (axios.get as any).mockResolvedValue(mockResponse);

      await expect(api.fetchRandomValue()).rejects.toThrow();
    });

    it('should throw error when API request fails', async () => {
      const error = new Error('Network error');
      (axios.get as any).mockRejectedValue(error);

      await expect(api.fetchRandomValue()).rejects.toThrow('Network error');
    });

    it('should throw error when API returns non-200 status', async () => {
      const error = {
        response: {
          status: 500,
          data: 'Internal Server Error',
        },
      };
      (axios.get as any).mockRejectedValue(error);

      await expect(api.fetchRandomValue()).rejects.toThrow();
    });

    it('should handle API response with different round values', async () => {
      const testCases = [
        { round: 0 },
        { round: 1 },
        { round: 999999 },
        { round: 4294967295 }, // Max 32-bit integer
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          data: {
            ...testCase,
            randomness: 'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c',
            signature: '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18',
            previous_signature: 'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf',
          },
        };

        (axios.get as any).mockResolvedValue(mockResponse);

        const result = await api.fetchRandomValue();
        expect(result.round).toBe(testCase.round);
      }
    });

    it('should handle API response with different string lengths', async () => {
      const mockResponse = {
        data: {
          round: 123,
          randomness: 'a'.repeat(64), // 64 character hex string
          signature: 'b'.repeat(128), // 128 character hex string
          previous_signature: 'c'.repeat(128), // 128 character hex string
        },
      };

      (axios.get as any).mockResolvedValue(mockResponse);

      const result = await api.fetchRandomValue();
      expect(result.randomness).toBe('a'.repeat(64));
      expect(result.signature).toBe('b'.repeat(128));
      expect(result.previous_signature).toBe('c'.repeat(128));
    });
  });
}); 
