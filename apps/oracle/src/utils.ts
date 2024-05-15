export const splitIntoFixedBatches = <T>(items: T[], batchSize: number): T[][] => {
  let batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
