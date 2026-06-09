import { useState } from "react";
import VideoList from "./components/VideoList";
import SettingsPanel from "./components/SettingsPanel";
import { useVideos } from "./hooks/useVideos";

interface Settings {
	cookie: string;
	columns: 1 | 2;
	theme: "light" | "dark";
}

const defaultSettings: Settings = {
	cookie: localStorage.getItem("bili-cookie") ?? "",
	columns: 2,
	theme: "dark",
};

export default function App() {
	const [settings, setSettings] = useState<Settings>(defaultSettings);
	const [showSettings, setShowSettings] = useState(false);
	const { displayed, loading, error, shuffle, loadMore } = useVideos(
		settings.cookie,
	);

	function handleSettingsChange(next: Settings) {
		localStorage.setItem("bili-cookie", next.cookie);
		setSettings(next);
	}

	return (
		<div
			className={`min-h-screen ${settings.theme === "dark" ? "bg-gray-900" : "bg-gray-100"}`}
		>
			<header className="sticky top-0 z-40 backdrop-blur-md bg-white/10 border-b border-white/10 px-4 py-3 flex items-center justify-between">
				<h1 className="text-white font-semibold text-base">Watch Later</h1>
				<div className="flex gap-2">
					<button
						onClick={shuffle}
						className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
					>
						Shuffle
					</button>
					<button
						onClick={() => setShowSettings(true)}
						className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
					>
						Settings
					</button>
				</div>
			</header>

			<main
				className={`max-w-4xl mx-auto ${settings.columns === 1 ? "[&_.grid]:grid-cols-1" : ""}`}
			>
				{!settings.cookie ? (
					<div className="text-center py-20 text-white/50 text-sm">
						open settings and paste your cookie to get started
					</div>
				) : (
					<VideoList
						videos={displayed}
						loading={loading}
						error={error}
						onLoadMore={loadMore}
					/>
				)}
			</main>

			{showSettings && (
				<SettingsPanel
					settings={settings}
					onChange={handleSettingsChange}
					onClose={() => setShowSettings(false)}
				/>
			)}
		</div>
	);
}
