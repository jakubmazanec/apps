export function to2dArray<T>(array: T[], columnCount: number): T[][] {
  const rowCount = Math.ceil(array.length / columnCount);

  return Array.from({length: columnCount}, (_, colIndex) =>
    Array.from({length: rowCount}, (_, rowIndex) => array[rowIndex * columnCount + colIndex] as T),
  );
}
