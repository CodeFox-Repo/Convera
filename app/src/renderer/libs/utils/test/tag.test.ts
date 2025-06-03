import { describe, it, expect } from 'vitest';
import { cleanTitle } from '../tag';

describe('cleanTitle', () => {
  it('returns default when empty', () => {
    expect(cleanTitle('')).toBe('Untitled Conversation');
  });

  it('replaces copied tags and truncates long content', () => {
    const text = '<copied>' + 'a'.repeat(60) + '</copied>';
    const result = cleanTitle(text);
    expect(result.startsWith('📋 ')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(54); // 2 emoji+space + 50 truncated + maybe '...'
  });

  it('truncates long titles to 100 chars', () => {
    const longTitle = 'b'.repeat(120);
    const result = cleanTitle(longTitle);
    expect(result.length).toBe(103);
    expect(result.endsWith('...')).toBe(true);
  });
});
