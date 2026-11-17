export const splitIntoFixedBatches = <T>(items: T[], batchSize: number): T[][] => {
  let batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
};

type FixedLengthArray<T, L extends number, R extends T[] = []> = R['length'] extends L
  ? R
  : FixedLengthArray<T, L, [T, ...R]>;

export const fillArray = <T>(
  inputArray: T[],
  desiredSize: number,
  fillItem: T,
): FixedLengthArray<T, 10> => {
  const outputArray = [...inputArray];
  while (outputArray.length < desiredSize) {
    outputArray.push(fillItem);
  }
  return outputArray as FixedLengthArray<T, 10>; // limitation on array size due to fixed length of Contract method
};

// On-chain fixed-point value of a USD price, truncated to `decimals` places (ORACLE_DECIMALS, 8 by
// default, the scale the DIA API feeds were always written with). Works on the price's shortest
// decimal form, so 0.29 becomes 29000000 and not the 28999999 that Math.floor(0.29 * 1e8) gives.
// The price is a JS number, so only its ~15-17 significant digits are exact; places beyond those
// are written as zeros.
export function toFixedPoint(price: number, decimals = 8): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid number of decimals: ${decimals}`);
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Cannot write price ${price} on chain`);
  }
  let text = String(price);
  if (text.includes('e')) {
    text = price.toFixed(20); // only tiny values use exponent form below 1e21
  }
  if (text.includes('e')) {
    throw new Error(`Price ${price} is too large to write on chain`);
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole + fraction.padEnd(decimals, '0').slice(0, decimals));
}
