import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/constants';

export function Header() {
  const { theme, setTheme } = useSettingsStore();
  const { isProcessing } = useAppStore();
  
  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };
  
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      {/* Left side - Title */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">Stemgen GUI</h1>
        <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
        
        {isProcessing && (
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Processing...
          </div>
        )}
      </div>
      
      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={`Current theme: ${theme}`}
        >
          <ThemeIcon className="h-5 w-5" />
        </Button>
        
        {/* Help link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open('https://github.com/zenla5/stemgen-gui', '_blank')}
        >
          Help
        </Button>
      </div>
    </header>
  );
}
