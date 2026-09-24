import { useEffect, useState } from 'react';
import VideoList from './components/VideoList';
import SettingsPanel from './components/SettingsPanel';
import { useVideos } from './hooks/useVideos';
import Header from './components/Header';
import { ArrowUp } from 'lucide-react';

interface Settings {
  cookie: string;
  columns: 1 | 2;
  theme: 'light' | 'dark';
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => ({
    cookie: localStorage.getItem('bili-cookie') ?? '',
    columns: 2,
    theme: localStorage.getItem('theme') === 'light' ? 'light' : 'dark',
  }));
  const [showSettings, setShowSettings] = useState(false);
  const {
    displayed,
    loading,
    error,
    errorEpoch,
    shuffle,
    reload,
    loadMore,
    deleteVideo,
    deleteError,
    clearDeleteError,
    lastSuccessfulFetchedAt,
  } = useVideos(settings.cookie);

  function handleSettingsChange(next: Settings) {
    localStorage.setItem('bili-cookie', next.cookie);
    localStorage.setItem('theme', next.theme);
    setSettings(next);
  }

  const [toastVisible, setToastVisible] = useState(false);

  // Fade the toast out on its own after 5s of no interaction; the actual
  // error is only cleared once the fade-out transition has finished, so it
  // can't pop back in mid-fade.
  useEffect(() => {
    if (!deleteError) return;

    const showTimer = setTimeout(() => setToastVisible(true), 0);

    const hideTimer = setTimeout(() => {
      setToastVisible(false);
      setTimeout(clearDeleteError, 300);
    }, 5000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [deleteError, clearDeleteError]);

  function dismissDeleteError() {
    setToastVisible(false);
    setTimeout(clearDeleteError, 300);
  }

  return (
    <div
      className={`min-h-screen ${settings.theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-100'} dark:text-white transition-colors`}
    >
      <Header
        reload={reload}
        shuffle={shuffle}
        setShowSettings={setShowSettings}
      />
      <main className="max-w-4xl mx-auto">
        {!settings.cookie ? (
          <div className="text-center py-20 dark:text-white/50 text-black/50 text-sm">
            open settings and paste your cookie to get started
          </div>
        ) : error && displayed.length === 0 ? (
          // No cached data to fall back on, so the error gets the full page.
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
          <>
            {error && (
              // A refresh failed but cached videos are still on screen;
              // show the error as a banner instead of swapping the list out.
              // key={errorEpoch} remounts the banner on every new failure so
              // the shake animation replays even for a repeated message.
              <div
                key={errorEpoch}
                className="animate-shake mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"
              >
                <span>{error}</span>
                <button
                  onClick={() => setShowSettings(true)}
                  className="shrink-0 underline underline-offset-2 hover:text-red-300 transition-colors"
                >
                  update cookie
                </button>
              </div>
            )}
            <VideoList
              videos={displayed}
              columns={settings.columns}
              loading={loading}
              onLoadMore={loadMore}
              onDelete={deleteVideo}
            />
          </>
        )}

        {deleteError && (
          <div
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg bg-red-500/90 text-white text-sm px-4 py-2.5 shadow-lg transition-opacity duration-300 ${
              toastVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {deleteError}
            <button
              onClick={dismissDeleteError}
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        <div className="fixed rounded-full bottom-8 right-8 p-2 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black">
          <ArrowUp
            size={25}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          />
        </div>
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
          lastSuccessfulFetchedAt={lastSuccessfulFetchedAt}
        />
      )}
    </div>
  );
}
