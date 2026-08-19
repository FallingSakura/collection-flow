import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Video } from '../types';

const PAGE_SIZE = 10;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Video[] Cache after a successful fetch, keyed by cookie hash.
const VIDEOS_STORAGE_PREFIX = 'video-list:';

// Only used for restoring order, not for displaying videos.
const ORDER_STORAGE_PREFIX = 'video-order:';

// The timestamp is stored as a number (milliseconds since epoch) in localStorage, keyed by cookie hash.
const FETCHED_AT_STORAGE_PREFIX = 'video-list-fetched-at:';

type OwnedState<T> = {
  owner: string;
  value: T;
};

type FreshVideos = {
  videos: Video[];
  orderIds: string[];
  fetchedAt: number;
};

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getCookieKey(cookie: string): string {
  if (!cookie) return '';

  return hashString(cookie).toString(36);
}

function readVideos(cookieKey: string): Video[] | null {
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

function saveVideos(cookieKey: string, videos: Video[]): void {
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

function readOrder(cookieKey: string): string[] | null {
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

function saveOrder(cookieKey: string, orderIds: string[]): void {
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

function readSuccessfulFetchedAt(cookieKey: string): number | null {
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

function saveSuccessfulFetchedAt(cookieKey: string, timestamp: number): void {
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

function pseudoRandomOrder(videos: Video[], seed: string): Video[] {
  return [...videos].sort((a, b) => {
    const hashA = hashString(`${seed}:${a.bvid}`);

    const hashB = hashString(`${seed}:${b.bvid}`);

    if (hashA !== hashB) {
      return hashA - hashB;
    }

    return a.bvid.localeCompare(b.bvid);
  });
}

function restoreOrder(
  videos: Video[],
  orderIds: string[],
  seed: string
): Video[] {
  const videoMap = new Map(videos.map(video => [video.bvid, video]));

  const result: Video[] = [];

  for (const id of orderIds) {
    const video = videoMap.get(id);

    if (!video) continue;

    result.push(video);
    videoMap.delete(id);
  }
  const newVideos = pseudoRandomOrder([...videoMap.values()], `${seed}:new`);

  result.push(...newVideos);

  return result;
}

function randomOrderIds(videos: Video[]): string[] {
  const ids = videos.map(video => video.bvid);

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
}

// fetchFreshVideos only fetches and persists, then passes these three values to React state.
async function fetchVideos(cookie: string): Promise<Video[]> {
  const res = await fetch('/api/videos', {
    headers: {
      'x-bili-cookie': cookie,
    },
  });

  let data: unknown;

  try {
    data = await res.json();
  } catch (error) {
    console.error('Failed to parse videos response:', error);

    throw new Error(`Server error: ${res.status}`, {
      cause: error,
    });
  }

  if (!res.ok) {
    let message = `Server error: ${res.status}`;

    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof data.message === 'string'
    ) {
      message = data.message;
    }

    throw new Error(message);
  }

  if (!Array.isArray(data)) {
    throw new Error('Server returned invalid video data format');
  }

  return data as Video[];
}

export function useVideos(cookie: string) {
  const cookieKey = useMemo(() => getCookieKey(cookie), [cookie]);

  const storedVideos = useMemo(() => readVideos(cookieKey), [cookieKey]);

  const storedOrderIds = useMemo(() => readOrder(cookieKey), [cookieKey]);

  const storedSuccessfulFetchedAt = useMemo(
    () => readSuccessfulFetchedAt(cookieKey),
    [cookieKey]
  );

  const [pageState, setPageState] = useState<OwnedState<number>>(() => ({
    owner: cookieKey,
    value: 0,
  }));

  const [videosState, setVideosState] = useState<OwnedState<Video[]> | null>(
    null
  );

  const [orderState, setOrderState] = useState<OwnedState<string[]> | null>(
    null
  );

  const [successfulFetchedAtState, setSuccessfulFetchedAtState] =
    useState<OwnedState<number> | null>(null);

  const { error, isFetching, refetch } = useQuery({
    queryKey: ['videos', cookieKey],
    queryFn: () => fetchVideos(cookie),
    // Request only comes from:
    // 1. User manually reload;
    // 2. Bootstrap determines that the cache does not exist or is more than one day old.
    enabled: false,
  });

  const videos = useMemo(
    () =>
      videosState?.owner === cookieKey
        ? videosState.value
        : (storedVideos ?? []),
    [videosState, cookieKey, storedVideos]
  );

  const activeOrderIds =
    orderState?.owner === cookieKey ? orderState.value : storedOrderIds;

  const page = pageState.owner === cookieKey ? pageState.value : 0;

  const lastSuccessfulFetchedAt =
    successfulFetchedAtState?.owner === cookieKey
      ? successfulFetchedAtState.value
      : storedSuccessfulFetchedAt;

  const initialPseudoOrderIds = useMemo(() => {
    if (!cookieKey || videos.length === 0 || activeOrderIds) {
      return null;
    }

    return pseudoRandomOrder(videos, cookieKey).map(video => video.bvid);
  }, [cookieKey, videos, activeOrderIds]);

  useEffect(() => {
    if (!initialPseudoOrderIds) {
      return;
    }

    saveOrder(cookieKey, initialPseudoOrderIds);
  }, [cookieKey, initialPseudoOrderIds]);

  const orderedVideos = useMemo(() => {
    if (!cookieKey || videos.length === 0) {
      return [];
    }

    const effectiveOrderIds = activeOrderIds ?? initialPseudoOrderIds ?? [];

    return restoreOrder(videos, effectiveOrderIds, cookieKey);
  }, [cookieKey, videos, activeOrderIds, initialPseudoOrderIds]);

  const applyFreshVideos = useCallback((owner: string, fresh: FreshVideos) => {
    setVideosState({
      owner,
      value: fresh.videos,
    });

    setOrderState({
      owner,
      value: fresh.orderIds,
    });

    setSuccessfulFetchedAtState({
      owner,
      value: fresh.fetchedAt,
    });

    setPageState({
      owner,
      value: 0,
    });
  }, []);

  const fetchFreshVideos =
    useCallback(async (): Promise<FreshVideos | null> => {
      if (!cookieKey) {
        return null;
      }

      try {
        const result = await refetch();

        if (result.error || !result.data) {
          return null;
        }

        const freshVideos = result.data;

        const freshOrderIds = randomOrderIds(freshVideos);

        const fetchedAt = Date.now();

        saveVideos(cookieKey, freshVideos);

        saveOrder(cookieKey, freshOrderIds);

        saveSuccessfulFetchedAt(cookieKey, fetchedAt);

        return {
          videos: freshVideos,
          orderIds: freshOrderIds,
          fetchedAt,
        };
      } catch (error) {
        console.error('Failed to refresh videos:', error);

        return null;
      }
    }, [cookieKey, refetch]);

  const currentCookieKeyRef = useRef(cookieKey);

  useEffect(() => {
    currentCookieKeyRef.current = cookieKey;
  }, [cookieKey]);

  const reload = useCallback(async () => {
    if (!cookieKey) return;

    const fresh = await fetchFreshVideos();

    if (!fresh) return;

    /*
     * Example: cookie A -> fetch -> cookie B -> fetch -> cookie A
     *
     * The first fetch for cookie A may return after the second fetch for cookie B.
     * We don't want to apply the stale result of cookie A to the current state.
     */
    if (currentCookieKeyRef.current !== cookieKey) {
      return;
    }

    applyFreshVideos(cookieKey, fresh);
  }, [cookieKey, fetchFreshVideos, applyFreshVideos]);

  const bootstrapRequestsRef = useRef<Map<string, Promise<FreshVideos | null>>>(
    new Map()
  );

  useEffect(() => {
    if (!cookieKey) {
      return;
    }

    const hasCachedVideos = storedVideos !== null;

    const cacheAge =
      storedSuccessfulFetchedAt === null
        ? null
        : Date.now() - storedSuccessfulFetchedAt;

    const cacheIsFresh =
      cacheAge !== null && cacheAge >= 0 && cacheAge < CACHE_TTL_MS;

    if (hasCachedVideos && cacheIsFresh) {
      return;
    }

    let request = bootstrapRequestsRef.current.get(cookieKey);

    if (!request) {
      const newRequest = fetchFreshVideos();

      bootstrapRequestsRef.current.set(cookieKey, newRequest);

      request = newRequest;

      void newRequest.then(() => {
        if (bootstrapRequestsRef.current.get(cookieKey) === newRequest) {
          bootstrapRequestsRef.current.delete(cookieKey);
        }
      });
    }

    let ignore = false;

    void request.then(fresh => {
      if (ignore || !fresh) {
        return;
      }

      applyFreshVideos(cookieKey, fresh);
    });

    return () => {
      ignore = true;
    };
  }, [
    cookieKey,
    storedVideos,
    storedSuccessfulFetchedAt,
    fetchFreshVideos,
    applyFreshVideos,
  ]);

  function loadMore() {
    if (!cookieKey) return;

    if (orderedVideos.length === 0) {
      return;
    }

    if ((page + 1) * PAGE_SIZE >= orderedVideos.length) {
      return;
    }

    setPageState(prev => {
      const currentPage = prev.owner === cookieKey ? prev.value : 0;

      return {
        owner: cookieKey,
        value: currentPage + 1,
      };
    });
  }

  function shuffle() {
    if (!cookieKey || videos.length === 0) {
      return;
    }

    const newOrderIds = randomOrderIds(videos);

    saveOrder(cookieKey, newOrderIds);

    setOrderState({
      owner: cookieKey,
      value: newOrderIds,
    });

    setPageState({
      owner: cookieKey,
      value: 0,
    });
  }

  const pendingDeleteRef = useRef<{ cookieKey: string; videos: Video[] }>({
    cookieKey: '',
    videos: [],
  });

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const flushPendingDeletes = useCallback(async () => {
    const batch = pendingDeleteRef.current;

    pendingDeleteRef.current = { cookieKey: '', videos: [] };
    deleteTimerRef.current = null;

    if (batch.videos.length === 0) return;

    try {
      const res = await fetch('/api/videos/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bili-cookie': cookie,
        },
        body: JSON.stringify({ aids: batch.videos.map(v => v.aid) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '删除失败');
      }
    } catch (err) {
      console.error('Failed to delete videos:', err);

      setDeleteError(
        err instanceof Error ? err.message : '删除失败，视频已恢复'
      );

      setVideosState(prev => {
        const base =
          prev?.owner === batch.cookieKey
            ? prev.value
            : (readVideos(batch.cookieKey) ?? []);

        const restored = [...base, ...batch.videos];

        saveVideos(batch.cookieKey, restored);

        return { owner: batch.cookieKey, value: restored };
      });
    }
  }, [cookie]);

  function deleteVideo(video: Video) {
    if (!cookieKey) return;

    const next = videos.filter(v => v.aid !== video.aid);

    saveVideos(cookieKey, next);

    setVideosState({ owner: cookieKey, value: next });

    if (pendingDeleteRef.current.cookieKey !== cookieKey) {
      if (pendingDeleteRef.current.videos.length > 0) {
        void flushPendingDeletes();
      }

      pendingDeleteRef.current = { cookieKey, videos: [video] };
    } else {
      pendingDeleteRef.current.videos.push(video);
    }

    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    deleteTimerRef.current = setTimeout(() => {
      void flushPendingDeletes();
    }, 800);
  }

  const clearDeleteError = useCallback(() => {
    setDeleteError(null);
  }, []);

  const displayed = orderedVideos.slice(0, (page + 1) * PAGE_SIZE);

  return {
    displayed,
    loading: isFetching,
    error: error instanceof Error ? error.message : null,
    shuffle,
    reload,
    loadMore,
    deleteVideo,
    deleteError,
    clearDeleteError,
    lastSuccessfulFetchedAt,
  };
}
