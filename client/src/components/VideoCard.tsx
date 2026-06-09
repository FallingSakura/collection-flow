import type { Video } from "../types";

interface Props {
	video: Video;
}

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0)
		return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoCard({ video }: Props) {
	return (
		<a
			href={video.url}
			target="_blank"
			rel="noopener noreferrer"
			className="block"
		>
			<div className="rounded-xl overflow-hidden bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors">
				<div className="relative">
					<img
						src={`/api/cover?url=${encodeURIComponent(video.cover)}`}
						alt={video.title}
						className="w-full aspect-video object-cover"
					/>
					<span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
						{formatDuration(video.duration)}
					</span>
				</div>
				<div className="p-3">
					<p className="text-sm font-medium text-white line-clamp-2 leading-snug">
						{video.title}
					</p>
					<p className="text-xs text-white/50 mt-1">{video.author}</p>
				</div>
			</div>
		</a>
	);
}
