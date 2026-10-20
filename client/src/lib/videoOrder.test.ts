import { describe, it, expect } from 'vitest';
import { restoreOrder, pseudoRandomOrder } from './videoOrder';
import type { Video } from '../types';
import { hashString } from './videoCache';

// Ordering only reads bvid; the other fields satisfy the type.
function video(bvid: string): Video {
  return {
    aid: 0,
    title: bvid,
    bvid,
    cover: '',
    author: '',
    duration: 0,
    url: '',
  };
}

describe('restoreOrder', () => {
  it('follows the saved order', () => {
    const videos = [video('a'), video('b'), video('c')];
    const result = restoreOrder(videos, ['c', 'a', 'b'], 'seed', hashString);
    expect(result.map(v => v.bvid)).toEqual(['c', 'a', 'b']);
  });

  it('skips saved ids that are no longer in the list', () => {
    const result = restoreOrder(
      [video('a')],
      ['gone', 'a'],
      'seed',
      hashString
    );
    expect(result.map(v => v.bvid)).toEqual(['a']);
  });

  it('appends videos missing from the saved order', () => {
    const videos = [video('a'), video('new'), video('b')];
    const result = restoreOrder(videos, ['b', 'a'], 'seed', hashString);
    expect(result.map(v => v.bvid)).toEqual(['b', 'a', 'new']);
  });
});

describe('pseudoRandomOrder', () => {
  it('returns the same order for the same seed', () => {
    const videos = Array.from({ length: 10 }, (_, i) => video(`v${i}`));
    const result1 = pseudoRandomOrder(videos, 'seed', hashString);
    const result2 = pseudoRandomOrder(videos, 'seed', hashString);
    expect(result1.map(v => v.bvid)).toEqual(result2.map(v => v.bvid));
  });
});
