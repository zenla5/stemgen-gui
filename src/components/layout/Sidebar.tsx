import { Music, ListMusic, Sliders, Settings, Library } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
}

type NavItem = { id: 'files' | 'queue' | 'mixer' | 'library' | 'settings'; icon: typeof Music; label: string };

export function Sidebar({ collapsed }: SidebarProps) {
  const { activeView, mobileSidebarOpen, setActiveView, closeMobileSidebar } = useAppStore();
  const { t } = useTranslation();

  const navItems: NavItem[] = [
    { id: 'files', icon: Music, label: t('nav.files') },
    { id: 'queue', icon: ListMusic, label: t('nav.queue') },
    { id: 'mixer', icon: Sliders, label: t('nav.mixer') },
    { id: 'library', icon: Library, label: t('nav.library') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ];

  const selectMobileView = (view: NavItem['id']) => {
    setActiveView(view);
    closeMobileSidebar();
  };

  return (
    <>
      {/* Mobile side-drawer — only mounted while open, overlaying the content. */}
      {mobileSidebarOpen && (
        <>
          <aside
            aria-label="Sidebar navigation"
            className="fixed top-14 bottom-0 left-0 z-40 w-56 flex flex-col border-r border-border bg-card transition-transform duration-200"
          >
            {renderSidebar(navItems, false, activeView, selectMobileView, t)}
          </aside>

          {/* Backdrop behind the mobile drawer */}
          <button
            data-testid="sidebar-backdrop"
            aria-label="Close navigation menu"
            type="button"
            className="fixed top-14 bottom-0 left-0 z-30 bg-background/60"
            onClick={closeMobileSidebar}
          />
        </>
      )}

      {/* Desktop sidebar — always visible on lg+, toggles collapsed/expanded. */}
      <aside
        aria-label="Sidebar navigation"
        className={cn(
          'hidden lg:flex flex-col border-r border-border bg-card transition-all duration-200',
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        {renderSidebar(navItems, collapsed, activeView, setActiveView, t)}
      </aside>
    </>
  );
}

function renderSidebar(
  navItems: NavItem[],
  collapsed: boolean,
  activeView: string,
  onSelect: (id: NavItem['id']) => void,
  t: (key: string) => string
) {
  return (
    <>
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                type="button"
                onClick={() => onSelect(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {!collapsed && (
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">{t('nav.shortcutHint')}</p>
        </div>
      )}
    </>
  );
}