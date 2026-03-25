import { Moon, Sun, Monitor, Github, Menu } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/constants';

export function Header() {
  const { toggleSidebar } = useAppStore();
  const { theme, setTheme } = useSettingsStore();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">S</span>
          </div>
          <div>
            <h1 className="font-semibold">Stemgen-GUI</h1>
            <p className="text-xs text-muted-foreground">v{APP_VERSION}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <a
          href="https://github.com/zenla5/stemgen-gui"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-2 hover:bg-muted"
        >
          <Github className="h-5 w-5" />
        </a>

        <div className="flex rounded-md border p-1">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'rounded px-2 py-1 text-sm transition-colors',
              theme === 'light' ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'rounded px-2 py-1 text-sm transition-colors',
              theme === 'dark' ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <Moon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={cn(
              'rounded px-2 py-1 text-sm transition-colors',
              theme === 'system' ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <Monitor className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
