import { describe, it, expect } from 'vitest';
import { splitIntoFixedBatches, fillArray } from '../src/utils';

describe('Utils', () => {
  describe('splitIntoFixedBatches', () => {
    it('should split array into batches of specified size', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batchSize = 3;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10]
      ]);
    });

    it('should handle empty array', () => {
      const items: number[] = [];
      const batchSize = 5;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([]);
    });

    it('should handle array smaller than batch size', () => {
      const items = [1, 2];
      const batchSize = 5;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([[1, 2]]);
    });

    it('should handle array exactly equal to batch size', () => {
      const items = [1, 2, 3];
      const batchSize = 3;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([[1, 2, 3]]);
    });

    it('should handle batch size of 1', () => {
      const items = [1, 2, 3, 4];
      const batchSize = 1;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([[1], [2], [3], [4]]);
    });

    it('should work with different data types', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const batchSize = 2;
      
      const result = splitIntoFixedBatches(items, batchSize);
      
      expect(result).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e']
      ]);
    });
  });

  describe('fillArray', () => {
    it('should fill array to desired size with fill item', () => {
      const inputArray = [1, 2, 3];
      const desiredSize = 5;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([1, 2, 3, 0, 0]);
      expect(result.length).toBe(5);
    });

    it('should return original array if already at desired size', () => {
      const inputArray = [1, 2, 3];
      const desiredSize = 3;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([1, 2, 3]);
      expect(result.length).toBe(3);
    });

    it('should return original array if larger than desired size', () => {
      const inputArray = [1, 2, 3, 4, 5];
      const desiredSize = 3;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(result.length).toBe(5);
    });

    it('should handle empty input array', () => {
      const inputArray: number[] = [];
      const desiredSize = 3;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([0, 0, 0]);
      expect(result.length).toBe(3);
    });

    it('should work with different data types', () => {
      const inputArray = ['a', 'b'];
      const desiredSize = 4;
      const fillItem = '';
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual(['a', 'b', '', '']);
      expect(result.length).toBe(4);
    });

    it('should work with objects as fill items', () => {
      const inputArray = [{ id: 1 }, { id: 2 }];
      const desiredSize = 4;
      const fillItem = { id: 0 };
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([
        { id: 1 },
        { id: 2 },
        { id: 0 },
        { id: 0 }
      ]);
      expect(result.length).toBe(4);
    });

    it('should handle zero desired size', () => {
      const inputArray = [1, 2, 3];
      const desiredSize = 0;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result).toEqual([1, 2, 3]);
      expect(result.length).toBe(3);
    });

    it('should have fixed length type constraint of 10', () => {
      // This test verifies the TypeScript constraint
      const inputArray = [1, 2, 3];
      const desiredSize = 10;
      const fillItem = 0;
      
      const result = fillArray(inputArray, desiredSize, fillItem);
      
      expect(result.length).toBe(10);
      // TypeScript should enforce that result is FixedLengthArray<T, 10>
    });
  });
}); 
