import { describe, it, expect } from 'vitest';
import { cn } from '../tailwind';

describe('cn', () => {
  it('merges class names and removes duplicates', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('ignores falsy values', () => {
    expect(cn('hidden', false && 'block', 'text-red')).toBe('hidden text-red');
  });
});
