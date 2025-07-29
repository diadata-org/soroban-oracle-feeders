import axios from 'axios';
import config from './config.js';
import z from 'zod';

const CoingeckoResponse = z.record(
  z.object({
    usd: z.number(),
    last_updated_at: z.number().int().optional(),
  }),
);

export async function getCoingeckoPrice(assetName: string) {
  const { url: baseUrl, apiKey } = config.guardian.coingecko;

  const url = `${baseUrl}/api/v3/simple/price?ids=${assetName}&vs_currencies=usd`;
  const header = baseUrl.includes('pro') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

  const resp = await axios(url, {
    headers: {
      [header]: apiKey,
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
  const { url, apiKey } = config.guardian.cmc;

  const resp = await axios(`${url}/v2/cryptocurrency/quotes/latest?id=${assetId}`, {
    headers: {
      'X-CMC_PRO_API_KEY': apiKey,
    },
  });

  const body = CmcResponse.parse(resp.data);
  return body.data[assetId]?.quote.USD.price ?? 0.0;
}
