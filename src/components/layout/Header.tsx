import { Moon, Sun, Monitor, Menu, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/constants';

export function Header() {
  const { openMobileSidebar, mobileSidebarOpen, closeMobileSidebar } = useAppStore();
  const { theme, setTheme } = useSettingsStore();

  return (
    <header className="relative z-50 flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-4">
        <button
          data-testid="mobile-menu-btn"
          onClick={mobileSidebarOpen ? closeMobileSidebar : openMobileSidebar}
          className="rounded-md p-2 hover:bg-muted lg:hidden"
          aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {mobileSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
          data-testid="github-link"
          href="https://github.com/zenla5/stemgen-gui"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-2 hover:bg-muted"
          aria-label="StemGen GitHub repository"
        >
          {/* lucide-react 1.x removed brand icons (Github); render the
              GitHub mark inline to keep the link recognizable. */}
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
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
