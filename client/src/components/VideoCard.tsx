import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';
import type { Video } from '../types';

interface Props {
  video: Video;
  onDelete: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoCard({ video, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Close the dropdown when clicking anywhere outside it. We can't rely on
  // a "fixed inset-0" backdrop here — the card's own backdrop-blur-md
  // creates a new containing block for its fixed-position descendants, so
  // a fixed overlay placed inside it only ever covers the card itself, not
  // the real viewport.
  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <div className="rounded-xl overflow-hidden dark:bg-white/10 bg-black/5 dark:border-none border-gray-300 border backdrop-blur-md hover:bg-white/20 transition-colors">
        <div className="relative">
          <img
            src={`/api/cover?url=${encodeURIComponent(video.cover)}`}
            alt={video.title}
            className="w-full aspect-video object-cover"
          />
          <span className="absolute bottom-2 right-2 dark:bg-black/70 bg-black/30 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        </div>
        <div className="p-3 relative">
          <p className="text-sm font-medium text-black dark:text-white line-clamp-2 leading-snug pr-6">
            {video.title}
          </p>
          <p className="text-xs text-black dark:text-white/50 mt-1">
            {video.author}
          </p>

          <div className="absolute bottom-2 right-2" ref={menuContainerRef}>
            <button
              onClick={e => {
                stop(e);
                setMenuOpen(v => !v);
              }}
              className="p-1 rounded-full dark:hover:bg-white/20 hover:bg-black/10 dark:text-white/60 text-black/50 transition-colors"
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <div
                onClick={stop}
                className="absolute bottom-full right-0 mb-1 w-28 p-1 rounded-xl dark:bg-black/80 bg-white/90 backdrop-blur-md border dark:border-white/10 border-gray-200 shadow-lg overflow-hidden z-20"
              >
                <button
                  onClick={e => {
                    stop(e);
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="w-full rounded-lg flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          onClick={stop}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={e => {
              stop(e);
              setConfirmOpen(false);
            }}
          />
          <div className="relative z-10 w-72 rounded-2xl dark:bg-black/80 bg-white border dark:border-white/10 border-gray-200 p-5 shadow-xl">
            <p className="text-sm dark:text-white text-black mb-4">
              确定要删除这个视频吗？
            </p>
            <div className="flex gap-2">
              <button
                onClick={e => {
                  stop(e);
                  setConfirmOpen(false);
                }}
                className="flex-1 py-1.5 rounded-lg text-sm dark:bg-white/10 bg-black/5 dark:text-white text-black hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
              >
                取消
              </button>
              <button
                onClick={e => {
                  stop(e);
                  setConfirmOpen(false);
                  onDelete();
                }}
                className="flex-1 py-1.5 rounded-lg text-sm bg-red-500/90 hover:bg-red-500 text-white transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </a>
  );
}
