import { useEffect, useRef } from "react";
import VideoCard from "./VideoCard";
import type { Video } from "../types";

interface Props {
	videos: Video[];
	loading: boolean;
	error: string | null;
	onLoadMore: () => void;
}

export default function VideoList({
	videos,
	loading,
	error,
	onLoadMore,
}: Props) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) onLoadMore();
			},
			{ threshold: 0.1 },
		);
		if (bottomRef.current) observer.observe(bottomRef.current);
		return () => observer.disconnect();
	}, [onLoadMore]);

	if (error)
		return <div className="text-center py-10 text-red-400">{error}</div>;

	return (
		<div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
				{videos.map((video) => (
					<VideoCard key={video.bvid} video={video} />
				))}
			</div>
			<div ref={bottomRef} className="py-6 text-center text-sm text-white/40">
				{loading ? "loading..." : videos.length > 0 ? "scroll for more" : ""}
			</div>
		</div>
	);
}
