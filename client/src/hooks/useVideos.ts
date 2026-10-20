import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Video } from '../types';
import { fetchVideos, deleteVideos } from '../lib/videoApi';
import {
  hashString,
  getCookieKey,
  readSuccessfulFetchedAt,
  saveSuccessfulFetchedAt,
  readVideos,
  saveVideos,
  readOrder,
  saveOrder,
} from '../lib/videoCache';

import {
  pseudoRandomOrder,
  restoreOrder,
  randomOrderIds,
} from '../lib/videoOrder';

/**
 * Per-cookie cache of the watch-later list: render from localStorage, fetch
 * only when it is missing or older than CACHE_TTL_MS.
 *
 * The cookie can change while a request is in flight. Results are tagged with
 * their cookie (OwnedState) and ignored once it is no longer selected, instead
 * of being cancelled.
 */

const PAGE_SIZE = 10;

// How long a cached list may be reused before an automatic refresh.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Each deletion goes through a confirm dialog, so consecutive ones are often
// more than a second apart; a shorter window rarely merges them. A tab closed
// inside the window drops the request, and those videos return on next fetch.
const DELETE_BATCH_DELAY_MS = 2000;

// A value tagged with the cookie it belongs to. It is used only while `owner`
// is the selected cookieKey, so one account's data does not show under another.
type OwnedState<T> = {
  owner: string;
  value: T;
};

type FreshVideos = {
  videos: Video[];
  orderIds: string[];
  fetchedAt: number;
};

export function useVideos(cookie: string) {
  const cookieKey = useMemo(() => getCookieKey(cookie), [cookie]);

  // Snapshots taken when this cookie was selected; later cache writes do not
  // update them. They are the initial value and the fallback, not live data.
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

  // Only used to run requests. This hook owns caching and freshness; a second
  // cache could disagree about what is fresh.
  const { isFetching, refetch } = useQuery({
    queryKey: ['videos', cookieKey],
    queryFn: () => fetchVideos(cookie),
    enabled: false,
    retry: false,
  });

  // useQuery clears its error when a refetch starts, which made the banner
  // flicker on reload. This copy changes only when a request finishes.
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);

  // The banner's key, so the shake replays even when the message repeats.
  const [errorEpoch, setErrorEpoch] = useState(0);

  // State written for a previous cookie counts as absent.
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

  // Only when no order is saved; the effect below saves it so it stays the
  // same across visits.
  const initialPseudoOrderIds = useMemo(() => {
    if (!cookieKey || videos.length === 0 || activeOrderIds) {
      return null;
    }

    return pseudoRandomOrder(videos, cookieKey, hashString).map(
      video => video.bvid
    );
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

    return restoreOrder(videos, effectiveOrderIds, cookieKey, hashString);
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

  // Saves to the cache and also returns the result. A caller that is no
  // longer current can drop the result; the next visit still gets the cache.
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

  // The cookie selected now. A callback's own `cookieKey` is the one from the
  // render that created it, so after an await only this ref can tell whether
  // the user has switched cookies.
  const currentCookieKeyRef = useRef(cookieKey);

  useEffect(() => {
    currentCookieKeyRef.current = cookieKey;
  }, [cookieKey]);

  // Drop the previous cookie's error. Adjusted during render rather than in
  // an effect, which would cost an extra render.
  const [prevCookieKey, setPrevCookieKey] = useState(cookieKey);

  if (prevCookieKey !== cookieKey) {
    setPrevCookieKey(cookieKey);
    setLastFetchError(null);
  }

  const reload = useCallback(async () => {
    if (!cookieKey) return;

    const fresh = await fetchFreshVideos();

    if (!fresh) return;

    // The user switched cookies while this request was in flight.
    if (currentCookieKeyRef.current !== cookieKey) {
      return;
    }

    applyFreshVideos(cookieKey, fresh);
  }, [cookieKey, fetchFreshVideos, applyFreshVideos]);

  // One in-flight request per cookie, shared by repeated effect runs
  // (StrictMode runs effects twice in development).
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

    // The shared request can outlive this effect; a late result is dropped.
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

  // Grows the slice instead of replacing the list, so rendered cards keep
  // their loaded images.
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

  // Deletions are optimistic (the card goes on confirm) and batched (one
  // request for a run of deletions). A batch keeps the cookie it was queued
  // under, so a cookie switch cannot send its aids to the wrong account.
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

  // No `cookie` dependency: the batch carries its own.
  const flushPendingDeletes = useCallback(async () => {
    const batch = pendingDeleteRef.current;

    pendingDeleteRef.current = { cookieKey: '', cookie: '', videos: [] };
    deleteTimerRef.current = null;

    if (batch.videos.length === 0) return;

    try {
      await deleteVideos(
        batch.cookie,
        batch.videos.map(v => v.aid)
      );
    } catch (err) {
      console.error('Failed to delete videos:', err);

      setDeleteError(
        err instanceof Error ? err.message : '删除失败，视频已恢复'
      );

      // Undo the optimistic delete in the batch's own cache bucket.
      const restored = [
        ...(readVideos(batch.cookieKey) ?? []),
        ...batch.videos,
      ];

      saveVideos(batch.cookieKey, restored);

      // The state slot is shared by all cookies. Skip the write if it would
      // evict the selected cookie's live list; this batch's cache is already
      // fixed and is re-read on the next switch.
      setVideosState(prev => {
        const evictsSelected =
          prev !== null &&
          prev.owner !== batch.cookieKey &&
          prev.owner === currentCookieKeyRef.current;

        return evictsSelected
          ? prev
          : { owner: batch.cookieKey, value: restored };
      });
    }
  }, []);

  function deleteVideo(video: Video) {
    if (!cookieKey) return;

    // Also removed from the cache, so a reload before the request settles
    // does not bring the card back.
    const next = videos.filter(v => v.aid !== video.aid);

    saveVideos(cookieKey, next);

    setVideosState({ owner: cookieKey, value: next });

    // The account changed: send the old batch with its own cookie first.
    if (pendingDeleteRef.current.cookieKey !== cookieKey) {
      if (pendingDeleteRef.current.videos.length > 0) {
        void flushPendingDeletes();
      }

      pendingDeleteRef.current = { cookieKey, cookie, videos: [video] };
    } else {
      pendingDeleteRef.current.videos.push(video);
    }

    // Restarted on each deletion, so one request goes out when they stop.
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    deleteTimerRef.current = setTimeout(() => {
      void flushPendingDeletes();
    }, DELETE_BATCH_DELAY_MS);
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
