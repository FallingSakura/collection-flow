import type { Video } from '../types';

/**
 * Looks shuffled but is the same for the same seed, so the default order does
 * not change between visits. `randomOrderIds` is the real shuffle.
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

/** Saved order first, then new videos in a seeded, stable order. */
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
