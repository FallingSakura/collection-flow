import { useState } from "react";
import VideoList from "./components/VideoList";
import SettingsPanel from "./components/SettingsPanel";
import { useVideos } from "./hooks/useVideos";

interface Settings {
	cookie: string;
	columns: 1 | 2;
	theme: "light" | "dark";
}

export default function App() {
	const [settings, setSettings] = useState<Settings>(() => ({
		cookie: localStorage.getItem("bili-cookie") ?? "",
		columns: 2,
		theme: localStorage.getItem("theme") === "light" ? "light" : "dark",
	}));
	const [showSettings, setShowSettings] = useState(false);
	const { displayed, loading, error, shuffle, loadMore } = useVideos(
		settings.cookie,
	);

	function handleSettingsChange(next: Settings) {
		localStorage.setItem("bili-cookie", next.cookie);
		localStorage.setItem("theme", next.theme);
		setSettings(next);
	}

	return (
		<div
			className={`min-h-screen ${settings.theme === "dark" ? "dark bg-gray-900" : "bg-gray-100"} dark:text-white transition-colors`}
		>
			<header className="sticky top-0 z-40 backdrop-blur-md dark:bg-white/10 bg-black/5 border-b dark:border-white/10 border-gray-300 px-4 py-3 flex items-center justify-between">
				<h1 className="text-black dark:text-white font-semibold text-base">
					Watch Later
				</h1>
				<div className="flex gap-2">
					<button
						onClick={shuffle}
						className="px-3 py-1.5 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
					>
						Shuffle
					</button>
					<button
						onClick={() => setShowSettings(true)}
						className="px-3 py-1.5 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
					>
						Settings
					</button>
				</div>
			</header>

			<main className="max-w-4xl mx-auto">
				{!settings.cookie ? (
					<div className="text-center py-20 dark:text-white/50 text-black/50 text-sm">
						open settings and paste your cookie to get started
					</div>
				) : error ? (
					<div className="text-center py-20 space-y-3">
						<p className="text-red-400 text-sm">{error}</p>
						<button
							onClick={() => setShowSettings(true)}
							className="px-4 py-2 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
						>
							update cookie
						</button>
					</div>
				) : (
					<VideoList
						videos={displayed}
						columns={settings.columns}
						loading={loading}
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
