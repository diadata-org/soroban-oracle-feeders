import axios from 'axios';
import config from './config';
import z from 'zod';

const CoingeckoResponse = z.record(
  z.object({
    usd: z.number(),
    last_updated_at: z.number().int().optional(),
  }),
);

export async function getCoingeckoPrice(assetName: string) {
  const url = `${config.coingecko.url}/api/v3/simple/price?ids=${assetName}&vs_currencies=usd`;

  const header = config.coingecko.url.includes('pro') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

  const resp = await axios(url, {
    headers: {
      [header]: config.coingecko.apiKey,
    },
  });

  const body = CoingeckoResponse.parse(resp.data);
  return body[assetName]?.usd ?? 0.0;
}

const CmcResponse = z.object({
  data: z.record(
    z.object({
      quote: z.object({
        USD: z.object({
          price: z.number(),
          last_updated: z.string(),
        }),
      }),
    }),
  ),
});

export async function getCmcPrice(assetId: string) {
  const resp = await axios(`${config.cmc.url}/v2/cryptocurrency/quotes/latest?id=${assetId}`, {
    headers: {
      'X-CMC_PRO_API_KEY': config.cmc.apiKey,
    },
  });

  const body = CmcResponse.parse(resp.data);
  return body.data[assetId]?.quote.USD.price ?? 0.0;
}
