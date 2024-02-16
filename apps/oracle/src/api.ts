import axios from 'axios';
import { request, gql } from 'graphql-request';
import config from './config';
import { Quotation, GraphqlQuotation, GqlParams } from './validation';

export type Asset = {
  network: string;
  address: string;
  symbol: string;
  gqlParams: GqlParams;
};

export async function getAssetPrices(assets: Asset[]) {
  const fetch = config.api.useGql
    ? (x: Asset) => getGraphqlAssetQuotation(x.network, x.address, x.gqlParams)
    : (x: Asset) => getAssetQuotation(x.network, x.address);

  const reqs = assets.map(async (asset) => {
    const price = await fetch(asset);
    return { key: asset.symbol, value: price };
  });

  const prices = new Map<string, number>();

  for (const result of await Promise.allSettled(reqs)) {
    if (result.status === 'rejected') {
      console.error(`Failed to retrieve quotation data from DIA: ${result.reason}`);
      continue;
    }

    const { key, value } = result.value;
    prices.set(key, value);
  }
  return prices;
}

async function getAssetQuotation(network: string, address: string) {
  const url = `${config.api.http.url}/${network}/${address}`;
  const data = await axios.get(url);
  return Quotation.parse(data).Price;
}

type FeedSelection = {
  Address: string;
  Blockchain: string;
  LiquidityThreshold?: number;
  Exchangepairs?: { Exchange: string; Pairs: string[] }[];
};

const feedQuery = gql`
  query (
    $startTime: Time!,
    $endTime: Time!,
    $feedSelection: [FeedSelection!]!
  ) {
    GetFeed(
      Filter: "${config.api.gql.methodology}",
      BlockSizeSeconds: ${config.api.gql.windowSize},
      BlockShiftSeconds: ${config.api.gql.windowSize},
      StartTime: $startTime,
      EndTime: $endTime,
      FeedSelection: $feedSelection
    )
    {
      Value
    }
  }
`;

async function getGraphqlAssetQuotation(network: string, address: string, params: GqlParams) {
  const feedSelection = [];
  const base = { Address: address, Blockchain: network } as FeedSelection;

  if (params.FeedSelection.length) {
    for (const feed of params.FeedSelection) {
      const item = { ...base };

      if (feed.LiquidityThreshold > 0) {
        const fixed = params.FeedSelection[0].LiquidityThreshold.toFixed(2);
        item.LiquidityThreshold = parseFloat(fixed);
      }

      if (feed.Exchangepairs.length) {
        item.Exchangepairs = feed.Exchangepairs;
      }
      feedSelection.push(item);
    }
  } else {
    feedSelection.push(base);
  }

  const now = Math.floor(Date.now() / 1000);
  const variables = {
    startTime: now - config.api.gql.windowSize * 2,
    endTime: now,
    feedSelection,
  };

  const res = await request(config.api.gql.url, feedQuery, variables);
  const data = GraphqlQuotation.parse(res);

  if (!data.GetFeed.length) {
    throw new Error('No results');
  }
  return data.GetFeed[data.GetFeed.length - 1].Value;
}
