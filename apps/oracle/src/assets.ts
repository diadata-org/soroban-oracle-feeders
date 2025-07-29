import { GqlParams } from './validation.js';

export enum AssetSource {
  Rest,
  Gql,
  Lumina,
}

export type Asset = {
  network: string;
  address: string;
  symbol: string;
  luminaKey: string;
  coingeckoName?: string;
  cmcName?: string;
  allowedDeviation: number;
  gqlParams: GqlParams;
};

export function parseAssets(source: AssetSource, cfg: string): Asset[] {
  const isLumina = source === AssetSource.Lumina;
  const parse = isLumina ? parseLuminaAsset : parseLegacyAsset;

  return cfg.split(';').map((item) => {
    const { asset: currAsset, extraFields } = parse(item);

    if (extraFields.length > 1) {
      [currAsset.coingeckoName, currAsset.cmcName] = extraFields;

      if (currAsset.coingeckoName || currAsset.cmcName) {
        const allowedDeviation = parseFloat(extraFields[2]);
        if (!isNaN(allowedDeviation)) {
          currAsset.allowedDeviation = allowedDeviation;
        }
      }
    }

    if (!isLumina && extraFields.length > 3) {
      const gqlQuery = extraFields[3];
      if (gqlQuery) {
        try {
          currAsset.gqlParams = GqlParams.parse(JSON.parse(gqlQuery));
        } catch (err: unknown) {
          console.error('Error while parsing GQL asset string: ', err);
        }
      }
    }

    return currAsset;
  });
}

type ParseResult = {
  asset: Asset;
  extraFields: string[];
};

const SEPARATOR = '§';

const defaultAsset = {
  network: '',
  address: '',
  luminaKey: '',
  allowedDeviation: 0.0,
  gqlParams: { FeedSelection: [] } as GqlParams,
};

function parseLegacyAsset(src: string): ParseResult {
  const [network, address, symbol, ...extraFields] = src
    .replace('-ibc-', '-ibc/')
    .split(SEPARATOR)
    .map((str) => str.trim());

  return {
    asset: {
      ...defaultAsset,
      network,
      address: address.replace('ibc/', 'ibc-'),
      symbol,
    },
    extraFields,
  };
}

function parseLuminaAsset(src: string): ParseResult {
  const [luminaKey, symbol, ...extraFields] = src.split(SEPARATOR).map((str) => str.trim());
  return {
    asset: { ...defaultAsset, luminaKey, symbol },
    extraFields,
  };
}
