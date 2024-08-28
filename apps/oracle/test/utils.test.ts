import { splitIntoFixedBatches, fillArray } from '../src/utils'; // Adjust the import path as necessary

describe('splitIntoFixedBatches', () => {
  it('should split an array into batches of specified size', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const batchSize = 3;
    const expectedBatches = [
      [1, 2, 3],
      [4, 5, 6],
      [7],
    ];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle an empty array', () => {
    const items: number[] = [];
    const batchSize = 3;
    const expectedBatches: number[][] = [];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle a batch size larger than the array', () => {
    const items = [1, 2];
    const batchSize = 5;
    const expectedBatches = [
      [1, 2],
    ];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle a batch size of 1', () => {
    const items = [1, 2, 3];
    const batchSize = 1;
    const expectedBatches = [[1], [2], [3]];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });
});

describe('fillArray', () => {
  it('should fill an array to the desired size with a specified item', () => {
    const inputArray = [1, 2, 3];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [1, 2, 3, 0, 0, 0, 0, 0, 0, 0];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should return the same array if it is already the desired size', () => {
    const inputArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should handle an empty array', () => {
    const inputArray: number[] = [];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should handle a non-default fill item', () => {
    const inputArray = [1, 2, 3];
    const desiredSize = 10;
    const fillItem = 99;
    const expectedArray = [1, 2, 3, 99, 99, 99, 99, 99, 99, 99];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });
});
