import { Music, ListMusic, Sliders, Settings, Library } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { activeView, setActiveView } = useAppStore();
  const { t } = useTranslation();

  const navItems = [
    { id: 'files' as const, icon: Music, label: t('nav.files') },
    { id: 'queue' as const, icon: ListMusic, label: t('nav.queue') },
    { id: 'mixer' as const, icon: Sliders, label: t('nav.mixer') },
    { id: 'library' as const, icon: Library, label: t('nav.library') },
    { id: 'settings' as const, icon: Settings, label: t('nav.settings') },
  ];

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => setActiveView(item.id)}
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
          <p className="text-xs text-muted-foreground">
            {t('nav.shortcutHint')}
          </p>
        </div>
      )}
    </aside>
  );
}
