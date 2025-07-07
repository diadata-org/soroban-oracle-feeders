import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { request } from 'graphql-request';
import * as configModule from '../src/config';
import { getAssetPrices, getAssetQuotation, getGraphqlAssetQuotation } from '../src/api';
import type { Asset } from '../src/api';

// Mock axios
vi.mock('axios');

// Mock graphql-request
vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: vi.fn((str) => str),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    api: {
      useGql: false,
      http: {
        url: 'https://api.diadata.org/v1/assetQuotation',
      },
      gql: {
        url: 'https://api.diadata.org/graphql/query',
        windowSize: 120,
        methodology: 'vwap',
      },
    },
  },
}));

// Mock validation
vi.mock('../src/validation', () => ({
  Quotation: {
    parse: vi.fn((data) => ({ Price: data.price })),
  },
  GraphqlQuotation: {
    parse: vi.fn((data) => ({ GetFeed: data.GetFeed })),
  },
}));

describe('API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAssetQuotation', () => {
    it('should fetch asset quotation successfully', async () => {
      const network = 'ethereum';
      const address = '0x123456789';
      const mockResponse = { data: { price: 50000 } };

      (axios.get as any).mockResolvedValue(mockResponse);

      const result = await getAssetQuotation(network, address);

      expect(axios.get).toHaveBeenCalledWith(
        `${configModule.default.api.http.url}/${network}/${address}`
      );
      expect(result).toBe(50000);
    });

    it('should handle API errors', async () => {
      const network = 'ethereum';
      const address = '0x123456789';
      const error = new Error('API Error');

      (axios.get as any).mockRejectedValue(error);

      await expect(getAssetQuotation(network, address)).rejects.toThrow('API Error');
    });
  });

  describe('getAssetPrices', () => {
    it('should fetch prices for multiple assets using HTTP API', async () => {
      const assets: Asset[] = [
        {
          network: 'ethereum',
          address: '0x123456789',
          symbol: 'BTC',
          gqlParams: { FeedSelection: [] },
        },
        {
          network: 'ethereum',
          address: '0x987654321',
          symbol: 'ETH',
          gqlParams: { FeedSelection: [] },
        },
      ];

      const mockResponses = [
        { data: { price: 50000 } },
        { data: { price: 3000 } },
      ];

      (axios.get as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await getAssetPrices(assets);

      expect(result.get('BTC')).toBe(50000);
      expect(result.get('ETH')).toBe(3000);
      expect(result.size).toBe(2);
    });

    it('should fetch prices for multiple assets using GraphQL API', async () => {
      // Mock config to use GraphQL
      vi.mocked(configModule.default.api).useGql = true;

      const assets: Asset[] = [
        {
          network: 'ethereum',
          address: '0x123456789',
          symbol: 'BTC',
          gqlParams: { FeedSelection: [] },
        },
        {
          network: 'ethereum',
          address: '0x987654321',
          symbol: 'ETH',
          gqlParams: { FeedSelection: [] },
        },
      ];

      const mockResponses = [
        { GetFeed: [{ Value: 50000 }] },
        { GetFeed: [{ Value: 3000 }] },
      ];

      (request as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await getAssetPrices(assets);

      expect(result.get('BTC')).toBe(50000);
      expect(result.get('ETH')).toBe(3000);
      expect(result.size).toBe(2);

      // Reset config
      vi.mocked(configModule.default.api).useGql = false;
    });

    it('should handle partial failures gracefully', async () => {
      const assets: Asset[] = [
        {
          network: 'ethereum',
          address: '0x123456789',
          symbol: 'BTC',
          gqlParams: { FeedSelection: [] },
        },
        {
          network: 'ethereum',
          address: '0x987654321',
          symbol: 'ETH',
          gqlParams: { FeedSelection: [] },
        },
      ];

      const mockResponse = { data: { price: 50000 } };
      const error = new Error('API Error');

      (axios.get as any)
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValueOnce(error);

      // Mock console.error to capture error logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getAssetPrices(assets);

      expect(result.get('BTC')).toBe(50000);
      expect(result.has('ETH')).toBe(false);
      expect(result.size).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to retrieve quotation data from DIA: Error: API Error'
      );

      consoleSpy.mockRestore();
    });

    it('should handle all failures gracefully', async () => {
      const assets: Asset[] = [
        {
          network: 'ethereum',
          address: '0x123456789',
          symbol: 'BTC',
          gqlParams: { FeedSelection: [] },
        },
      ];

      const error = new Error('API Error');

      (axios.get as any).mockRejectedValue(error);

      // Mock console.error to capture error logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getAssetPrices(assets);

      expect(result.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to retrieve quotation data from DIA: Error: API Error'
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty assets array', async () => {
      const assets: Asset[] = [];

      const result = await getAssetPrices(assets);

      expect(result.size).toBe(0);
    });

    it('should process assets in parallel', async () => {
      const assets: Asset[] = [
        {
          network: 'ethereum',
          address: '0x123456789',
          symbol: 'BTC',
          gqlParams: { FeedSelection: [] },
        },
        {
          network: 'ethereum',
          address: '0x987654321',
          symbol: 'ETH',
          gqlParams: { FeedSelection: [] },
        },
        {
          network: 'ethereum',
          address: '0x555666777',
          symbol: 'SOL',
          gqlParams: { FeedSelection: [] },
        },
      ];

      const mockResponses = [
        { data: { price: 50000 } },
        { data: { price: 3000 } },
        { data: { price: 100 } },
      ];

      (axios.get as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      const startTime = Date.now();
      const result = await getAssetPrices(assets);
      const endTime = Date.now();

      // Should complete quickly (parallel execution)
      expect(endTime - startTime).toBeLessThan(100);
      expect(result.size).toBe(3);
      expect(result.get('BTC')).toBe(50000);
      expect(result.get('ETH')).toBe(3000);
      expect(result.get('SOL')).toBe(100);
    });
  });

  describe('Error handling and validation', () => {
    it('should handle validation errors in HTTP response', async () => {
      const network = 'ethereum';
      const address = '0x123456789';
      const invalidResponse = { data: { invalid: 'data' } };

      (axios.get as any).mockResolvedValue(invalidResponse);

      // Mock validation to throw error
      const { Quotation } = await import('../src/validation');
      vi.mocked(Quotation.parse).mockImplementation(() => {
        throw new Error('Validation failed');
      });

      await expect(getAssetQuotation(network, address)).rejects.toThrow('Validation failed');
    });

    it('should handle validation errors in GraphQL response', async () => {
      const network = 'ethereum';
      const address = '0x123456789';
      const params = { FeedSelection: [] };
      const invalidResponse = { invalid: 'data' };

      (request as any).mockResolvedValue(invalidResponse);

      // Mock validation to throw error
      const { GraphqlQuotation } = await import('../src/validation');
      vi.mocked(GraphqlQuotation.parse).mockImplementation(() => {
        throw new Error('GraphQL validation failed');
      });

      await expect(getGraphqlAssetQuotation(network, address, params)).rejects.toThrow('GraphQL validation failed');
    });
  });
}); 
