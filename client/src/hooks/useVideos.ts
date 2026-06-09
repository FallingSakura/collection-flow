import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Video } from "../types";

const PAGE_SIZE = 10;

async function fetchVideos(cookie: string): Promise<Video[]> {
	const res = await fetch("/api/random", {
		headers: { "x-bili-cookie": cookie },
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error);
	return data;
}

export function useVideos(cookie: string) {
	const [page, setPage] = useState(0);

	const { data, error, isLoading, refetch } = useQuery({
		queryKey: ["videos", cookie],
		queryFn: () => fetchVideos(cookie),
		enabled: !!cookie,
	});

	const displayed = data?.slice(0, (page + 1) * PAGE_SIZE) ?? [];

	function loadMore() {
		if (!data) return;
		if ((page + 1) * PAGE_SIZE >= data.length) return;
		setPage((p) => p + 1);
	}

	function shuffle() {
		setPage(0);
		refetch();
	}

	return {
		displayed,
		loading: isLoading,
		error: error instanceof Error ? error.message : null,
		shuffle,
		loadMore,
	};
}
