import nock from 'nock';

const mockAsset = process.env.MOCK_ASSET || 'Bitcoin';
const mockAssetAddress = process.env.MOCK_ASSET_ADDRESS || '0x0000000000000000000000000000000000000000';
const mockAssetPrice = parseFloat(process.env.MOCK_ASSET_PRICE || '59191.899625082246');
const mockAssetSymbol = process.env.MOCK_ASSET_SYMBOL || 'BTC';


export const setupNock = () => {
  console.log(`Mocking asset: ${mockAsset} with price: ${mockAssetPrice}`);
  console.log(`/v1/assets/${mockAsset}/${mockAssetAddress}`);

  nock('https://api.diadata.org')
    .persist()
    .get(`/v1/assetQuotation/${mockAsset}/${mockAssetAddress}`)
    .reply(200,
      { "Symbol": mockAssetSymbol, "Name": mockAsset, "Address": mockAssetAddress, "Blockchain": "Bitcoin", "Price": mockAssetPrice, "PriceYesterday": 59394.2204603554, "VolumeYesterdayUSD": 7650210259.713156, "Time":  new Date(), "Source": "diadata.org", "Signature": "0x0b34a02d2aa9b259eb9a0456e4a1754e98ea91e105667e89ce0c636cd1427348770bdebc3ead36ecb77085f017b813e0e7271250495124b07294b5f82c2f49b301" }
    );
}
