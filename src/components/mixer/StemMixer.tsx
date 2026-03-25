import { useState } from 'react';
import { Sliders, Volume2, VolumeX, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export function StemMixer() {
  const { currentStems, updateStem, resetStemMixer } = useAppStore();
  
  const handleVolumeChange = (stemId: string, volume: number[]) => {
    updateStem(stemId, { volume: volume[0] });
  };
  
  const handleToggleMute = (stemId: string) => {
    const stem = currentStems.find((s) => s.id === stemId);
    if (stem) {
      updateStem(stemId, { muted: !stem.muted });
    }
  };
  
  const handleToggleSolo = (stemId: string) => {
    const stem = currentStems.find((s) => s.id === stemId);
    if (stem) {
      // If enabling solo, disable solo on all other stems
      if (!stem.solo) {
        currentStems.forEach((s) => updateStem(s.id, { solo: false }));
      }
      updateStem(stemId, { solo: !stem.solo });
    }
  };
  
  const handleSoloAll = () => {
    currentStems.forEach((s) => updateStem(s.id, { solo: true }));
  };
  
  const handleUnmuteAll = () => {
    currentStems.forEach((s) => updateStem(s.id, { muted: false, solo: false }));
  };
  
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stem Mixer</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSoloAll}>
            <Headphones className="mr-2 h-4 w-4" />
            Solo All
          </Button>
          <Button variant="outline" size="sm" onClick={handleUnmuteAll}>
            <Volume2 className="mr-2 h-4 w-4" />
            Unmute All
          </Button>
          <Button variant="ghost" size="sm" onClick={resetStemMixer}>
            Reset
          </Button>
        </div>
      </div>
      
      {/* Mixer channels */}
      <div className="flex flex-1 gap-4">
        {currentStems.map((stem) => (
          <div
            key={stem.id}
            className={cn(
              'flex flex-1 flex-col rounded-xl border p-4 transition-colors',
              stem.muted ? 'border-border bg-muted/30' : 'border-border bg-card'
            )}
          >
            {/* Stem header */}
            <div className="mb-4 text-center">
              <div
                className="mx-auto mb-2 h-3 w-12 rounded-full"
                style={{ backgroundColor: stem.color }}
              />
              <h3 className="font-medium">{stem.name}</h3>
            </div>
            
            {/* Volume fader */}
            <div className="flex flex-1 items-center justify-center">
              <div className="relative h-full">
                <Slider
                  orientation="vertical"
                  value={[stem.volume * 100]}
                  onValueChange={(value) => handleVolumeChange(stem.id, value)}
                  max={100}
                  step={1}
                  className="h-full"
                />
                <div
                  className="pointer-events-none absolute left-1/2 w-1 rounded-full transition-all"
                  style={{
                    height: `${stem.volume * 100}%`,
                    backgroundColor: stem.color,
                    bottom: 0,
                    transform: 'translateX(-50%)',
                  }}
                />
              </div>
            </div>
            
            {/* Volume percentage */}
            <div className="mt-4 text-center">
              <span className="font-mono text-sm">
                {Math.round(stem.volume * 100)}%
              </span>
            </div>
            
            {/* Control buttons */}
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant={stem.muted ? 'destructive' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => handleToggleMute(stem.id)}
                title={stem.muted ? 'Unmute' : 'Mute'}
              >
                {stem.muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant={stem.solo ? 'default' : 'outline'}
                size="icon"
                className={cn(
                  'h-8 w-8',
                  stem.solo && 'bg-yellow-500 hover:bg-yellow-600'
                )}
                onClick={() => handleToggleSolo(stem.id)}
                title={stem.solo ? 'Unsolo' : 'Solo'}
              >
                <Headphones className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Preview info */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sliders className="h-4 w-4" />
          <span>Adjust stem volumes and preview before exporting.</span>
        </div>
      </div>
    </div>
  );
}
