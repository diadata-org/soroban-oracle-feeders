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
