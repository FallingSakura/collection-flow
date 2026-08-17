interface Settings {
  cookie: string;
  columns: 1 | 2;
  theme: 'light' | 'dark';
}

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-96 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-6 shadow-xl">
        <h2 className="text-white font-semibold text-lg mb-6">Settings</h2>

        <div className="space-y-5">
          <div>
            <label className="text-white/70 text-sm mb-1.5 block">Cookie</label>
            <textarea
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-xs p-2.5 resize-none focus:outline-none focus:border-white/40 scrollbar-none"
              rows={4}
              placeholder="paste your bilibili cookie here"
              value={settings.cookie}
              onChange={e => onChange({ ...settings, cookie: e.target.value })}
            />
          </div>

          <div>
            <label className="text-white/70 text-sm mb-1.5 block">Layout</label>
            <div className="flex gap-2">
              {([1, 2] as const).map(col => (
                <button
                  key={col}
                  onClick={() => onChange({ ...settings, columns: col })}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    settings.columns === col
                      ? 'bg-white/30 text-white'
                      : 'bg-white/10 text-white/50 hover:bg-white/20'
                  }`}
                >
                  {col === 1 ? 'Single' : 'Double'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm mb-1.5 block">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ ...settings, theme: t })}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors capitalize ${
                    settings.theme === t
                      ? 'bg-white/30 text-white'
                      : 'bg-white/10 text-white/50 hover:bg-white/20'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
