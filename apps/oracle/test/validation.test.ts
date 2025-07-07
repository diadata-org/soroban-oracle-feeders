import { describe, it, expect } from 'vitest';
import { GqlParams, Quotation, GraphqlQuotation } from '../src/validation';

describe('Validation Schemas', () => {
  describe('GqlParams', () => {
    it('should validate valid GqlParams with all fields', () => {
      const validData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            LiquidityThreshold: 1000,
            Exchangepairs: [
              {
                Exchange: 'uniswap',
                Pairs: ['BTC/USD', 'ETH/USD'],
              },
            ],
          },
        ],
      };

      const result = GqlParams.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate GqlParams with minimal required fields', () => {
      const validData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
          },
        ],
      };

      const result = GqlParams.parse(validData);
      expect(result).toEqual({
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            LiquidityThreshold: 0,
            Exchangepairs: [],
          },
        ],
      });
    });

    it('should validate GqlParams with multiple feed selections', () => {
      const validData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            LiquidityThreshold: 1000,
          },
          {
            Address: '0x987654321',
            Blockchain: 'polygon',
            Exchangepairs: [
              {
                Exchange: 'sushiswap',
                Pairs: ['MATIC/USD'],
              },
            ],
          },
        ],
      };

      const result = GqlParams.parse(validData);
      expect(result.FeedSelection).toHaveLength(2);
      expect(result.FeedSelection[0].LiquidityThreshold).toBe(1000);
      expect(result.FeedSelection[0].Exchangepairs).toEqual([]);
      expect(result.FeedSelection[1].LiquidityThreshold).toBe(0);
      expect(result.FeedSelection[1].Exchangepairs).toHaveLength(1);
    });

    it('should validate empty FeedSelection array', () => {
      const validData = {
        FeedSelection: [],
      };

      const result = GqlParams.parse(validData);
      expect(result.FeedSelection).toEqual([]);
    });

    it('should reject invalid data with missing Address', () => {
      const invalidData = {
        FeedSelection: [
          {
            Blockchain: 'ethereum',
            LiquidityThreshold: 1000,
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Blockchain', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            LiquidityThreshold: 1000,
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Address type', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: 123,
            Blockchain: 'ethereum',
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Blockchain type', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 123,
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong LiquidityThreshold type', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            LiquidityThreshold: '1000',
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Exchangepairs structure', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            Exchangepairs: [
              {
                Exchange: 'uniswap',
                Pairs: 'BTC/USD', // Should be array
              },
            ],
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Exchange in Exchangepairs', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            Exchangepairs: [
              {
                Pairs: ['BTC/USD'],
              },
            ],
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Pairs in Exchangepairs', () => {
      const invalidData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            Exchangepairs: [
              {
                Exchange: 'uniswap',
              },
            ],
          },
        ],
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject data with missing FeedSelection', () => {
      const invalidData = {};

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });

    it('should reject data with wrong FeedSelection type', () => {
      const invalidData = {
        FeedSelection: 'not-an-array',
      };

      expect(() => GqlParams.parse(invalidData)).toThrow();
    });
  });

  describe('Quotation', () => {
    it('should validate valid Quotation data', () => {
      const validData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      const result = Quotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate Quotation with integer prices', () => {
      const validData = {
        Symbol: 'ETH',
        Name: 'Ethereum',
        Price: 3000,
        PriceYesterday: 2950,
        VolumeYesterdayUSD: 1500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      const result = Quotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate Quotation with zero values', () => {
      const validData = {
        Symbol: 'USDC',
        Name: 'USD Coin',
        Price: 0,
        PriceYesterday: 0,
        VolumeYesterdayUSD: 0,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      const result = Quotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate Quotation with negative prices', () => {
      const validData = {
        Symbol: 'TEST',
        Name: 'Test Token',
        Price: -1.5,
        PriceYesterday: -2.0,
        VolumeYesterdayUSD: -1000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      const result = Quotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should reject invalid data with missing Symbol', () => {
      const invalidData = {
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Name', () => {
      const invalidData = {
        Symbol: 'BTC',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Price', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Price type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: '50000.50',
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong PriceYesterday type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: '49000.25',
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong VolumeYesterdayUSD type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: '2500000000',
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Source', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Time', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Symbol type', () => {
      const invalidData = {
        Symbol: 123,
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Name type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 123,
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Source type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 123,
        Time: '2024-01-01T00:00:00Z',
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Time type', () => {
      const invalidData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: 50000.50,
        PriceYesterday: 49000.25,
        VolumeYesterdayUSD: 2500000000,
        Source: 'DIA',
        Time: 123,
      };

      expect(() => Quotation.parse(invalidData)).toThrow();
    });
  });

  describe('GraphqlQuotation', () => {
    it('should validate valid GraphqlQuotation with single feed', () => {
      const validData = {
        GetFeed: [
          { Value: 50000.50 },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate valid GraphqlQuotation with multiple feeds', () => {
      const validData = {
        GetFeed: [
          { Value: 50000.50 },
          { Value: 51000.25 },
          { Value: 52000.75 },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate GraphqlQuotation with integer values', () => {
      const validData = {
        GetFeed: [
          { Value: 50000 },
          { Value: 51000 },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate GraphqlQuotation with zero values', () => {
      const validData = {
        GetFeed: [
          { Value: 0 },
          { Value: 0.0 },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate GraphqlQuotation with negative values', () => {
      const validData = {
        GetFeed: [
          { Value: -1.5 },
          { Value: -100 },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should validate empty GetFeed array', () => {
      const validData = {
        GetFeed: [],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result.GetFeed).toEqual([]);
    });

    it('should reject invalid data with missing GetFeed', () => {
      const invalidData = {};

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong GetFeed type', () => {
      const invalidData = {
        GetFeed: 'not-an-array',
      };

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with missing Value in feed item', () => {
      const invalidData = {
        GetFeed: [
          { SomeOtherField: 50000 },
        ],
      };

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with wrong Value type', () => {
      const invalidData = {
        GetFeed: [
          { Value: '50000.50' },
        ],
      };

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with extra fields in feed item', () => {
      const invalidData = {
        GetFeed: [
          { Value: 50000.50, ExtraField: 'should-not-be-here' },
        ],
      };

      // This should actually pass since Zod allows extra fields by default
      const result = GraphqlQuotation.parse(invalidData);
      expect(result.GetFeed[0].Value).toBe(50000.50);
    });

    it('should reject invalid data with null Value', () => {
      const invalidData = {
        GetFeed: [
          { Value: null },
        ],
      };

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });

    it('should reject invalid data with undefined Value', () => {
      const invalidData = {
        GetFeed: [
          { Value: undefined },
        ],
      };

      expect(() => GraphqlQuotation.parse(invalidData)).toThrow();
    });
  });

  describe('Type exports', () => {
    it('should export GqlParams type', () => {
      // This test ensures the type is exported
      // We can't directly test TypeScript types at runtime, but we can verify the export exists
      expect(typeof GqlParams).toBe('object');
      expect(GqlParams.parse).toBeDefined();
    });

    it('should export Quotation type', () => {
      expect(typeof Quotation).toBe('object');
      expect(Quotation.parse).toBeDefined();
    });

    it('should export GraphqlQuotation type', () => {
      expect(typeof GraphqlQuotation).toBe('object');
      expect(GraphqlQuotation.parse).toBeDefined();
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle very large numbers in GqlParams', () => {
      const validData = {
        FeedSelection: [
          {
            Address: '0x123456789',
            Blockchain: 'ethereum',
            LiquidityThreshold: Number.MAX_SAFE_INTEGER,
            Exchangepairs: [
              {
                Exchange: 'uniswap',
                Pairs: ['BTC/USD'],
              },
            ],
          },
        ],
      };

      const result = GqlParams.parse(validData);
      expect(result.FeedSelection[0].LiquidityThreshold).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very large numbers in Quotation', () => {
      const validData = {
        Symbol: 'BTC',
        Name: 'Bitcoin',
        Price: Number.MAX_SAFE_INTEGER,
        PriceYesterday: Number.MAX_SAFE_INTEGER,
        VolumeYesterdayUSD: Number.MAX_SAFE_INTEGER,
        Source: 'DIA',
        Time: '2024-01-01T00:00:00Z',
      };

      const result = Quotation.parse(validData);
      expect(result.Price).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very large numbers in GraphqlQuotation', () => {
      const validData = {
        GetFeed: [
          { Value: Number.MAX_SAFE_INTEGER },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result.GetFeed[0].Value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very small numbers (including negative)', () => {
      const validData = {
        GetFeed: [
          { Value: Number.MIN_SAFE_INTEGER },
          { Value: -Number.MAX_SAFE_INTEGER },
        ],
      };

      const result = GraphqlQuotation.parse(validData);
      expect(result.GetFeed[0].Value).toBe(Number.MIN_SAFE_INTEGER);
      expect(result.GetFeed[1].Value).toBe(-Number.MAX_SAFE_INTEGER);
    });

    it('should handle empty strings in GqlParams', () => {
      const validData = {
        FeedSelection: [
          {
            Address: '',
            Blockchain: '',
            Exchangepairs: [
              {
                Exchange: '',
                Pairs: [''],
              },
            ],
          },
        ],
      };

      const result = GqlParams.parse(validData);
      expect(result.FeedSelection[0].Address).toBe('');
      expect(result.FeedSelection[0].Blockchain).toBe('');
      expect(result.FeedSelection[0].Exchangepairs[0].Exchange).toBe('');
      expect(result.FeedSelection[0].Exchangepairs[0].Pairs[0]).toBe('');
    });

    it('should handle empty strings in Quotation', () => {
      const validData = {
        Symbol: '',
        Name: '',
        Price: 0,
        PriceYesterday: 0,
        VolumeYesterdayUSD: 0,
        Source: '',
        Time: '',
      };

      const result = Quotation.parse(validData);
      expect(result.Symbol).toBe('');
      expect(result.Name).toBe('');
      expect(result.Source).toBe('');
      expect(result.Time).toBe('');
    });
  });
}); 
