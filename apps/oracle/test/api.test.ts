import axios from 'axios';
import { request } from 'graphql-request';
import * as apiModule from '../src/api';
import { getAssetQuotation, getGraphqlAssetQuotation } from '../src/api/dia';
import { AssetSource, type Asset } from '../src/assets';
import config from '../src/config';
import { Quotation, GraphqlQuotations, GqlParams } from '../src/validation'; // Adjust path as needed

jest.mock('axios');
jest.mock('graphql-request');
jest.mock('../src/config');

describe('API Module', () => {
  const mockGqlParams: GqlParams = {
    FeedSelection: [
      {
        Address: '0x123',
        Blockchain: 'eth',
        LiquidityThreshold: 0,
        Exchangepairs: [],
      },
    ],
  };

  const mockAssets: Asset[] = [
    {
      network: 'eth',
      address: '0x123',
      symbol: 'ETH',
      luminaKey: 'ETH/USD',
      gqlParams: mockGqlParams,
      allowedDeviation: 0.0,
    },
    {
      network: 'bsc',
      address: '0x456',
      symbol: 'BNB',
      luminaKey: 'BNB/USD',
      gqlParams: mockGqlParams,
      allowedDeviation: 0.0,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAssetPrices', () => {
    it('should fetch prices using HTTP API when config.api.useGql is false', async () => {
      (config.assets.source as any) = AssetSource.Rest;

      const mockQuotation: Quotation = {
        Symbol: 'ETH',
        Name: 'Ethereum',
        Price: 2000,
        PriceYesterday: 1950,
        VolumeYesterdayUSD: 1000000000,
        Source: 'MockSource',
        Time: new Date().toISOString(),
      };

      (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockQuotation });
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: { ...mockQuotation, Symbol: 'BNB', Price: 300 },
      });

      const prices = await apiModule.getAssetPrices(mockAssets);

      expect(prices.get('ETH')).toBe(2000);
      expect(prices.get('BNB')).toBe(300);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should fetch prices using GraphQL API when config.api.useGql is true', async () => {
      (config.assets.source as any) = AssetSource.Gql;

      const mockGraphqlQuotations: GraphqlQuotations = {
        GetFeed: [{ Value: 2000 }],
      };

      (request as jest.Mock).mockResolvedValueOnce(mockGraphqlQuotations);
      (request as jest.Mock).mockResolvedValueOnce({ GetFeed: [{ Value: 300 }] });

      const prices = await apiModule.getAssetPrices(mockAssets);

      expect(prices.get('ETH')).toBe(2000);
      expect(prices.get('BNB')).toBe(300);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('should handle errors in fetching prices gracefully', async () => {
      (config.assets.source as any) = AssetSource.Rest;

      const mockQuotation: Quotation = {
        Symbol: 'ETH',
        Name: 'Ethereum',
        Price: 2000,
        PriceYesterday: 1950,
        VolumeYesterdayUSD: 1000000000,
        Source: 'MockSource',
        Time: new Date().toISOString(),
      };

      (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockQuotation });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch price'));

      const prices = await apiModule.getAssetPrices(mockAssets);

      expect(prices.get('ETH')).toBe(2000);
      expect(prices.has('BNB')).toBe(false);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAssetQuotation', () => {
    it('should fetch and parse the asset quotation correctly', async () => {
      const mockQuotation: Quotation = {
        Symbol: 'ETH',
        Name: 'Ethereum',
        Price: 2000,
        PriceYesterday: 1950,
        VolumeYesterdayUSD: 1000000000,
        Source: 'MockSource',
        Time: new Date().toISOString(),
      };

      (axios.get as jest.Mock).mockResolvedValue({ data: mockQuotation });

      const price = await getAssetQuotation('eth', '0x123');

      expect(price).toBe(2000);
      expect(axios.get).toHaveBeenCalledWith(`${config.api.http.url}/eth/0x123`);
    });

    it('should throw an error if the API response is invalid', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: {} });

      await expect(getAssetQuotation('eth', '0x123')).rejects.toThrow();
    });
  });

  describe('getGraphqlAssetQuotation', () => {
    it('should fetch and parse the GraphQL asset quotation correctly', async () => {
      const mockGraphqlQuotations: GraphqlQuotations = {
        GetFeed: [{ Value: 2000 }],
      };

      (request as jest.Mock).mockResolvedValue(mockGraphqlQuotations);

      const price = await getGraphqlAssetQuotation('eth', '0x123', {
        FeedSelection: [],
      });

      expect(price).toBe(2000);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if the GraphQL response has no results', async () => {
      (request as jest.Mock).mockResolvedValue({ GetFeed: [] });

      await expect(
        getGraphqlAssetQuotation('eth', '0x123', { FeedSelection: [] }),
      ).rejects.toThrow('No results');
    });
  });
});
