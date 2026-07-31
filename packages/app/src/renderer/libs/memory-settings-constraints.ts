export const MIN_MEMORY_BATCH_SIZE = 2;
export const MAX_MEMORY_BATCH_SIZE = 100;

export function isValidMemoryBatchSize(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_MEMORY_BATCH_SIZE &&
    value <= MAX_MEMORY_BATCH_SIZE
  );
}
