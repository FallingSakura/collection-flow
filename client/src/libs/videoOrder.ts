import type { Video } from '../types';

/**
 * Two orderings exist, and the difference between them is the point:
 *
 * - `pseudoRandomOrder` is deterministic, seeded by the cookie, so the list
 *   looks shuffled but comes out identical on every visit. This is what the
 *   user sees before pressing shuffle.
 * - `randomOrderIds` is a real shuffle, used only when the user asks for one.
 *
 * Either way the result is persisted: an order recomputed on each load would
 * move cards around between visits.
 */
export function pseudoRandomOrder(
  videos: Video[],
  seed: string,
  hash: (value: string) => number
): Video[] {
  const decorated = videos.map(video => ({
    video,
    hash: hash(`${seed}:${video.bvid}`),
  }));

  decorated.sort((a, b) => {
    if (a.hash !== b.hash) {
      return a.hash - b.hash;
    }

    return a.video.bvid.localeCompare(b.video.bvid);
  });

  return decorated.map(item => item.video);
}

// Applies the saved order, then appends whatever it does not mention — videos
// added to the account since, or returned by a fresh fetch. The appended ones
// go in a deterministic order so a refresh does not reshuffle the tail.
export function restoreOrder(
  videos: Video[],
  orderIds: string[],
  seed: string,
  hash: (value: string) => number
): Video[] {
  const videoMap = new Map(videos.map(video => [video.bvid, video]));

  const result: Video[] = [];

  for (const id of orderIds) {
    const video = videoMap.get(id);

    if (!video) continue;

    result.push(video);
    videoMap.delete(id);
  }
  const newVideos = pseudoRandomOrder(
    [...videoMap.values()],
    `${seed}:new`,
    hash
  );

  result.push(...newVideos);

  return result;
}

export function randomOrderIds(videos: Video[]): string[] {
  const ids = videos.map(video => video.bvid);

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
}
