import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Video } from '../types';
import {
  hashString,
  getCookieKey,
  readSuccessfulFetchedAt,
  saveSuccessfulFetchedAt,
  readVideos,
  saveVideos,
  readOrder,
  saveOrder,
} from './videoCache';

/**
 * Per-cookie client-side cache for the "watch later" list.
 *
 * The bilibili endpoint is slow and rate-limited, and the user's list changes
 * rarely, so the hook reads a cache first and refreshes only when it is missing
 * or stale. Since the data is fetched with the user's own cookie, everything is
 * partitioned by a hash of that cookie.
 *
 * The hard part is the asynchrony: the user can change their cookie while
 * requests for the previous one are still in flight. Rather than cancelling
 * those requests, every async result is tagged with the cookie it belongs to
 * and dropped if that cookie is no longer selected. See `OwnedState` below.
 */

const PAGE_SIZE = 10;

// How long a cached list may be reused before an automatic refresh.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * State that remembers which cookie it belongs to.
 *
 * A request started under cookie A can resolve after the user has switched to
 * cookie B. Every value is labelled with its `owner`; consumers use it only
 * while `owner` still matches the selected cookieKey, and otherwise fall back
 * to that cookie's cached data. This is what keeps one account's data from
 * showing up under another's.
 */
type OwnedState<T> = {
  owner: string;
  value: T;
};

type FreshVideos = {
  videos: Video[];
  orderIds: string[];
  fetchedAt: number;
};

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

// Applies the saved order, then appends whatever it does not mention — videos
// added to the account since, or returned by a fresh fetch. The appended ones
// go in a deterministic order so a refresh does not reshuffle the tail.
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

/**
 * Deliberately reports the server's own error text rather than the status
 * code: a failed bilibili call still returns HTTP 400 with a body like
 * {"error":"账号未登录"}, and that message is what tells the user whether their
 * cookie expired or something else went wrong.
 */
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
      'error' in data &&
      typeof data.error === 'string' &&
      data.error
    ) {
      message = data.error;
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

  // Read during render: the reads are synchronous and the memos re-run only
  // when the cookie changes, so mirroring them into state would just add a
  // second copy to keep in sync.
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

  // TanStack Query is used purely as a fetch primitive: `enabled: false` means
  // every request is triggered explicitly (the user pressing reload, or the
  // bootstrap below finding the cache unusable). Its own caching is left
  // unused, because freshness policy already lives in this hook, and two
  // caches disagreeing about what is fresh is worse than either one alone.
  const { isFetching, refetch } = useQuery({
    queryKey: ['videos', cookieKey],
    queryFn: () => fetchVideos(cookie),
    enabled: false,
    retry: false,
  });

  // Held here rather than read from useQuery, which clears its error the
  // instant a refetch starts — reading it directly makes the error banner
  // vanish and reappear on every reload. This copy is written only when a
  // request finishes, so it stays put while one is in flight.
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);

  // Used as the banner's React key so its attention animation replays even
  // when a new failure produces an identical message.
  const [errorEpoch, setErrorEpoch] = useState(0);

  // The owner checks in the next four values are the consumer half of the
  // OwnedState contract: state written for a previous cookie is treated as
  // absent, so each cookie falls back to its own cached data.
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

  // Computed only when nothing is saved yet; the effect below persists it,
  // which is what turns a deterministic-for-this-cookie order into a stable
  // one across sessions.
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

  // Fetches, persists, and hands the same values back to the caller. The write
  // is not an optional side effect — it is what lets the next visit start from
  // cache — while the return value lets the caller put the result on screen
  // now. A caller that no longer cares (stale cookie, unmounted component) can
  // drop the return value without having wasted the write.
  const fetchFreshVideos =
    useCallback(async (): Promise<FreshVideos | null> => {
      if (!cookieKey) {
        return null;
      }

      try {
        const result = await refetch();

        if (result.error) {
          setLastFetchError(
            result.error instanceof Error
              ? result.error.message
              : 'Failed to fetch videos'
          );

          setErrorEpoch(epoch => epoch + 1);

          return null;
        }

        if (!result.data) {
          return null;
        }

        setLastFetchError(null);

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

  /**
   * Why a ref and not just `cookieKey`:
   *
   * A callback closes over the values of the render that created it, so the
   * `reload` created while cookie A was selected still sees A in its closure
   * after the user pastes cookie B. By the time its `await` returns, it has no
   * way to tell from its own variables that it is now late.
   *
   * A ref does not have that problem: this effect runs after every commit, so
   * `currentCookieKeyRef.current` reflects the cookie selected at the time it
   * is read. Comparing the two answers "is this result still wanted?" — the
   * question `reload` has to ask before applying it.
   */
  const currentCookieKeyRef = useRef(cookieKey);

  useEffect(() => {
    currentCookieKeyRef.current = cookieKey;
  }, [cookieKey]);

  // A different cookie means different data; the old error text no longer
  // applies. React's recommended "adjust state during render" pattern: this
  // runs during the render pass itself, no effect and no cascading renders.
  // If the new cookie also fails, the bootstrap fetch writes a fresh error.
  const [prevCookieKey, setPrevCookieKey] = useState(cookieKey);

  if (prevCookieKey !== cookieKey) {
    setPrevCookieKey(cookieKey);
    setLastFetchError(null);
  }

  const reload = useCallback(async () => {
    if (!cookieKey) return;

    const fresh = await fetchFreshVideos();

    if (!fresh) return;

    /*
     * Example: cookie A -> fetch -> cookie B -> fetch -> cookie A
     *
     * The first fetch for cookie A may return after the second fetch for cookie B.
     * We don't want to apply the stale result of cookie A to the current state.
     *
     * The comparison is between the ref (what is selected now) and this
     * closure's own cookieKey (what this request was for); they differ exactly
     * when the user has changed cookies mid-flight.
     */
    if (currentCookieKeyRef.current !== cookieKey) {
      return;
    }

    applyFreshVideos(cookieKey, fresh);
  }, [cookieKey, fetchFreshVideos, applyFreshVideos]);

  /**
   * In-flight requests keyed by cookie, so that concurrent triggers for the
   * same cookie share one network call instead of racing each other. React
   * StrictMode double-invokes effects in development, and this effect has
   * several dependencies that can change together; without the map, opening
   * the app with a cold cache would fire the same request twice. Entries are
   * removed once settled.
   */
  const bootstrapRequestsRef = useRef<Map<string, Promise<FreshVideos | null>>>(
    new Map()
  );

  // Fetches only when the cache cannot be trusted: nothing stored, or stored
  // longer than the TTL ago. A returning user inside the TTL window renders
  // straight from localStorage.
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

    // The shared request can outlive this effect instance (unmount, or the
    // cookie changing while it runs). The flag is per-instance, so a result
    // arriving too late is dropped here rather than applied to state it no
    // longer describes.
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

  // Paging is by growing slice rather than by replacing the list, so already
  // rendered cards keep their identity and their images stay loaded.
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

  /**
   * Deletions are optimistic and batched.
   *
   * Optimistic, because the card is gone from the user's point of view the
   * moment they confirm — waiting for a round trip before hiding it makes the
   * UI feel broken. The cost is that a failure must be undone, which is the
   * restore path below.
   *
   * Batched, because deleting a few videos in a row is one intention, and one
   * request per card would be slower and likelier to fail halfway, leaving the
   * list and the account disagreeing about what still exists.
   *
   * The queue carries the credentials it was built under. A batch can outlive
   * the cookie that created it (the debounce is short, but switching accounts
   * is only a paste away), and sending those aids with a different account's
   * cookie would target the wrong account.
   */
  const pendingDeleteRef = useRef<{
    cookieKey: string;
    cookie: string;
    videos: Video[];
  }>({
    cookieKey: '',
    cookie: '',
    videos: [],
  });

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // No `cookie` dependency: the batch supplies its own credentials, so the
  // callback stays valid across a cookie switch instead of being rebuilt (and
  // potentially outrun by) a newer render.
  const flushPendingDeletes = useCallback(async () => {
    const batch = pendingDeleteRef.current;

    pendingDeleteRef.current = { cookieKey: '', cookie: '', videos: [] };
    deleteTimerRef.current = null;

    if (batch.videos.length === 0) return;

    try {
      const res = await fetch('/api/videos/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bili-cookie': batch.cookie,
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

      // Counterpart to the optimistic update: the server refused, so the
      // videos are still there. They go back under the batch's own cookieKey,
      // not the current one.
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
  }, []);

  function deleteVideo(video: Video) {
    if (!cookieKey) return;

    // Removed from the visible list and from the cache together: a reload
    // before the request settles should not bring the card back.
    const next = videos.filter(v => v.aid !== video.aid);

    saveVideos(cookieKey, next);

    setVideosState({ owner: cookieKey, value: next });

    // A queued batch belongs to the cookie it was created under. Getting here
    // with a different cookieKey means the account changed, so the old batch is
    // sent with its own cookie before a new one starts.
    if (pendingDeleteRef.current.cookieKey !== cookieKey) {
      if (pendingDeleteRef.current.videos.length > 0) {
        void flushPendingDeletes();
      }

      pendingDeleteRef.current = { cookieKey, cookie, videos: [video] };
    } else {
      pendingDeleteRef.current.videos.push(video);
    }

    // Restarting the timer means one request goes out once the user stops
    // clicking, rather than one per card.
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    deleteTimerRef.current = setTimeout(() => {
      void flushPendingDeletes();
    }, 2000);
  }

  const clearDeleteError = useCallback(() => {
    setDeleteError(null);
  }, []);

  const displayed = orderedVideos.slice(0, (page + 1) * PAGE_SIZE);

  return {
    displayed,
    loading: isFetching,
    error: lastFetchError,
    errorEpoch,
    shuffle,
    reload,
    loadMore,
    deleteVideo,
    deleteError,
    clearDeleteError,
    lastSuccessfulFetchedAt,
  };
}
