import { Volume2, VolumeX, Headphones, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export function StemMixer() {
  const { currentStems, updateStem, resetStemMixer } = useAppStore();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stem Mixer</h2>
        <button
          onClick={resetStemMixer}
          className="flex items-center gap-2 rounded-md border border-muted px-3 py-1.5 text-sm hover:bg-muted/50"
        >
          <RefreshCw className="h-4 w-4" />
          Reset
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {currentStems.map((stem) => (
          <div
            key={stem.id}
            className="flex flex-col gap-3 rounded-lg border p-4"
            style={{ borderColor: `${stem.color}40` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: stem.color }}
                />
                <span className="font-medium">{stem.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => updateStem(stem.id, { solo: !stem.solo })}
                  className={cn(
                    'rounded p-1 transition-colors',
                    stem.solo
                      ? 'bg-yellow-500/20 text-yellow-600'
                      : 'hover:bg-muted'
                  )}
                  title="Solo"
                >
                  <Headphones className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updateStem(stem.id, { muted: !stem.muted })}
                  className={cn(
                    'rounded p-1 transition-colors',
                    stem.muted
                      ? 'bg-red-500/20 text-red-600'
                      : 'hover:bg-muted'
                  )}
                  title="Mute"
                >
                  {stem.muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Volume</span>
                <span>{Math.round(stem.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={stem.volume * 100}
                onChange={(e) =>
                  updateStem(stem.id, { volume: parseInt(e.target.value) / 100 })
                }
                className="w-full accent-primary"
                style={{
                  accentColor: stem.color,
                }}
              />
            </div>

            {stem.file_path && (
              <p className="truncate text-xs text-muted-foreground">
                {stem.file_path.split(/[/\\]/).pop()}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto rounded-lg border bg-muted/50 p-4">
        <h3 className="mb-2 text-sm font-medium">Preview</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-pulse bg-primary" />
            </div>
          </div>
          <span className="text-sm text-muted-foreground">0:00 / 3:45</span>
        </div>
      </div>
    </div>
  );
}
