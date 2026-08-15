import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Video } from "../types";

const PAGE_SIZE = 10;
const STORAGE_PREFIX = "shuffled-video-order:";

type OrderState = {
  owner: string;
  orderIds: string[];
};

type PageState = {
  owner: string;
  page: number;
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
  if (!cookie) return "";

  return hashString(cookie).toString(36);
}

function getStorageKey(cookieKey: string): string {
  return STORAGE_PREFIX + cookieKey;
}

function readOrder(cookieKey: string): string[] | null {
  if (!cookieKey) return null;

  try {
    const raw = localStorage.getItem(getStorageKey(cookieKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    if (!parsed.every((item) => typeof item === "string")) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to read video order from localStorage:", error);
    return null;
  }
}

function saveOrder(cookieKey: string, orderIds: string[]): void {
  if (!cookieKey) return;

  try {
    localStorage.setItem(getStorageKey(cookieKey), JSON.stringify(orderIds));
  } catch (error) {
    console.error("Failed to save video order to localStorage:", error);
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
  seed: string,
): Video[] {
  const videoMap = new Map(videos.map((v) => [v.bvid, v]));
  const result: Video[] = [];

  for (const id of orderIds) {
    const video = videoMap.get(id);
    if (video) {
      result.push(video);
      videoMap.delete(id);
    }
  }
  const newVideos = pseudoRandomOrder([...videoMap.values()], `${seed}:new`);
  result.push(...newVideos);
  return result;
}

function randomOrderIds(videos: Video[]): string[] {
  const ids = videos.map((video) => video.bvid);

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
}

async function fetchVideos(cookie: string): Promise<Video[]> {
  const res = await fetch("/api/videos", {
    headers: { "x-bili-cookie": cookie },
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch (error) {
    console.error("Failed to parse videos response:", error);
    throw new Error(`服务器返回了无效的 JSON，状态码：${res.status}`, {
      cause: error,
    });
  }
  if (!res.ok) {
    let message = `请求失败，状态码：${res.status}`;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      message = data.message;
    }
    throw new Error(message);
  }
  if (!Array.isArray(data)) {
    throw new Error("服务器返回的视频数据格式不正确");
  }
  return data as Video[];
}

export function useVideos(cookie: string) {
  const cookieKey = useMemo(() => getCookieKey(cookie), [cookie]);
  const [pageState, setPageState] = useState<PageState>(() => ({
    owner: cookieKey,
    page: 0,
  }));
  const [orderState, setOrderState] = useState<OrderState | null>(null);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["videos", cookieKey],
    queryFn: () => fetchVideos(cookie),
    enabled: !!cookie,
    staleTime: Infinity,
  });

  const page = pageState.owner === cookieKey ? pageState.page : 0;
  const storedOrder = useMemo(() => readOrder(cookieKey), [cookieKey]);
  const activeOrderIds =
    orderState?.owner === cookieKey ? orderState.orderIds : storedOrder;
  const initialPseudoOrder = useMemo(() => {
    if (!data || !cookieKey || activeOrderIds) {
      return null;
    }

    return pseudoRandomOrder(data, cookieKey).map((video) => video.bvid);
  }, [data, cookieKey, activeOrderIds]);
  useEffect(() => {
    if (initialPseudoOrder) {
      saveOrder(cookieKey, initialPseudoOrder);
    }
  }, [initialPseudoOrder, cookieKey]);

  const shuffled = useMemo(() => {
    if (!cookieKey || !data) return [];
    const effectiveOrderIds = activeOrderIds ?? initialPseudoOrder ?? [];
    return restoreOrder(data, effectiveOrderIds, cookieKey);
  }, [data, cookieKey, activeOrderIds, initialPseudoOrder]);

  const reload = async () => {
    if (!cookieKey) return;
    const result = await refetch();
    if (result.error || !result.data) return;
    const newOrderIds = randomOrderIds(result.data);
    setPageState({ owner: cookieKey, page: 0 });
    setOrderState({ owner: cookieKey, orderIds: newOrderIds });
    saveOrder(cookieKey, newOrderIds);
  };

  const displayed = shuffled.slice(0, (page + 1) * PAGE_SIZE);

  function loadMore() {
    if (!cookieKey) return;
    if (shuffled.length === 0) return;
    if ((page + 1) * PAGE_SIZE >= shuffled.length) return;
    setPageState((prev) => {
      const currentPage = prev.owner === cookieKey ? prev.page : 0;
      return {
        owner: cookieKey,
        page: currentPage + 1,
      };
    });
  }

  function shuffle() {
    if (!data || !data.length || !cookieKey) return;
    const newOrderIds = randomOrderIds(data);
    setPageState({ owner: cookieKey, page: 0 });
    setOrderState({ owner: cookieKey, orderIds: newOrderIds });
    saveOrder(cookieKey, newOrderIds);
  }

  return {
    displayed,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    shuffle,
    reload,
    loadMore,
  };
}
