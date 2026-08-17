import { Shuffle, Settings, RefreshCw } from 'lucide-react';
import Tooltip from './Tooltip';

interface Props {
  reload: () => void;
  shuffle: () => void;
  lastSuccessfulFetchedAt: number | null;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Header({
  reload,
  shuffle,
  lastSuccessfulFetchedAt,
  setShowSettings,
}: Props) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md dark:bg-white/10 bg-black/5 border-b dark:border-white/10 border-gray-300 px-4 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-black dark:text-white font-semibold text-base">
          Watch Later
        </h1>
        {lastSuccessfulFetchedAt && (
          <p className="text-xs dark:text-white/40 text-black/40">
            Updated: {new Date(lastSuccessfulFetchedAt).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Tooltip label="Reload from server">
          <button
            onClick={() => {
              reload();
              scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="px-3 py-1.5 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
          >
            <RefreshCw size="20" />
          </button>
        </Tooltip>
        <Tooltip label="Shuffle order">
          <button
            onClick={() => {
              shuffle();
              scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="px-3 py-1.5 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
          >
            <Shuffle size="20" />
          </button>
        </Tooltip>
        <Tooltip label="Settings">
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 rounded-lg dark:bg-white/10 dark:hover:bg-white/20 dark:text-white bg-black/5 hover:bg-black/10 text-black text-sm transition-colors"
          >
            <Settings size="20" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
