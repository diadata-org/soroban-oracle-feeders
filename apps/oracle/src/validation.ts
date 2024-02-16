import z from 'zod';

export type GqlParams = z.infer<typeof GqlParams>;
export type Quotation = z.infer<typeof Quotation>;
export type GraphqlQuotations = z.infer<typeof GraphqlQuotation>;

export const GqlParams = z.object({
  FeedSelection: z.array(
    z.object({
      Address: z.string(),
      Blockchain: z.string(),
      LiquidityThreshold: z.number().optional().default(0),
      Exchangepairs: z
        .array(
          z.object({
            Exchange: z.string(),
            Pairs: z.array(z.string()),
          }),
        )
        .optional()
        .default([]),
    }),
  ),
});

export const Quotation = z.object({
  Symbol: z.string(),
  Name: z.string(),
  Price: z.number(),
  PriceYesterday: z.number(),
  VolumeYesterdayUSD: z.number(),
  Source: z.string(),
  Time: z.string(),
});

export const GraphqlQuotation = z.object({
  GetFeed: z.array(z.object({ Value: z.number() })),
});
