import type { Video } from '../types';

// The timestamp is stored as a number (milliseconds since epoch) in localStorage, keyed by cookie hash.
const FETCHED_AT_STORAGE_PREFIX = 'video-list-fetched-at:';

// The three cache keys share a suffix: a hash of the cookie, not the cookie
// itself. localStorage is readable by any script on this origin and visible in
// devtools, and a bilibili cookie is a live login credential.
const VIDEOS_STORAGE_PREFIX = 'video-list:';

// Only used for restoring order, not for displaying videos.
const ORDER_STORAGE_PREFIX = 'video-order:';

// FNV-1a, used to turn the cookie into a short opaque key. It is not a
// cryptographic hash and offers no collision resistance worth relying on —
// the point is only to avoid storing the credential itself and to keep the
// key a manageable length. Buckets are few and long-lived, so a collision
// would at worst mix two accounts' caches.
export function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getCookieKey(cookie: string): string {
  if (!cookie) return '';

  return hashString(cookie).toString(36);
}

/**
 * The readers below return `null` instead of throwing, and `null` means the
 * same as "nothing stored". localStorage is shared with everything else on
 * this origin and may hold data written by an older version of this app, so
 * unreadable content is treated as "no cache" rather than as a crash. The
 * shape checks serve that end: a half-valid entry from a previous schema would
 * otherwise surface as a failure far from here.
 */
export function readVideos(cookieKey: string): Video[] | null {
  if (!cookieKey) return null;

  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_PREFIX + cookieKey);

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return null;
    }

    if (
      !parsed.every(
        item => item !== null && typeof item === 'object' && 'bvid' in item
      )
    ) {
      return null;
    }

    return parsed as Video[];
  } catch (error) {
    console.error('Failed to read cached video list from localStorage:', error);

    return null;
  }
}

export function saveVideos(cookieKey: string, videos: Video[]): void {
  if (!cookieKey) return;

  try {
    localStorage.setItem(
      VIDEOS_STORAGE_PREFIX + cookieKey,
      JSON.stringify(videos)
    );
  } catch (error) {
    console.error('Failed to save video list to localStorage:', error);
  }
}

export function readOrder(cookieKey: string): string[] | null {
  if (!cookieKey) return null;

  try {
    const raw = localStorage.getItem(ORDER_STORAGE_PREFIX + cookieKey);

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return null;
    }

    if (!parsed.every(item => typeof item === 'string')) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Failed to read video order from localStorage:', error);

    return null;
  }
}

export function saveOrder(cookieKey: string, orderIds: string[]): void {
  if (!cookieKey) return;

  try {
    localStorage.setItem(
      ORDER_STORAGE_PREFIX + cookieKey,
      JSON.stringify(orderIds)
    );
  } catch (error) {
    console.error('Failed to save video order to localStorage:', error);
  }
}

export function readSuccessfulFetchedAt(cookieKey: string): number | null {
  if (!cookieKey) return null;

  try {
    const raw = localStorage.getItem(FETCHED_AT_STORAGE_PREFIX + cookieKey);

    if (!raw) return null;

    const timestamp = Number(raw);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }

    return timestamp;
  } catch (error) {
    console.error(
      'Failed to read last successful fetch time from localStorage:',
      error
    );

    return null;
  }
}

export function saveSuccessfulFetchedAt(
  cookieKey: string,
  timestamp: number
): void {
  if (!cookieKey) return;

  try {
    localStorage.setItem(
      FETCHED_AT_STORAGE_PREFIX + cookieKey,
      String(timestamp)
    );
  } catch (error) {
    console.error(
      'Failed to save last successful fetch time to localStorage:',
      error
    );
  }
}
