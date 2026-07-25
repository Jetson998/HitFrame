import { useEffect, useRef, useState } from 'react';
import { Home, Sparkles, MessageSquare, FolderOpen, Menu, X, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, navFromLocation, type NavKey } from '@/store';
import { Logo } from '@/components/Logo';
import { TokenGate } from '@/components/TokenGate';
import { AssetDetailDialog } from '@/components/AssetDetailDialog';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { HomePage } from '@/pages/HomePage';
import { GeneratePage } from '@/pages/GeneratePage';
import { TemplateConfigPage } from '@/pages/TemplateConfigPage';
import { AgentPage } from '@/pages/AgentPage';
import { AssetsPage } from '@/pages/AssetsPage';

const NAV_ITEMS: Array<{ key: NavKey; icon: typeof Home; label: string }> = [
  { key: 'home', icon: Home, label: '首页' },
  { key: 'generate', icon: Sparkles, label: 'AI 图片' },
  { key: 'agent', icon: MessageSquare, label: 'Agent' },
  { key: 'assets', icon: FolderOpen, label: '资产库' },
];

export default function App() {
  const { nav, setNav, auth, bootError, bootstrap, balance, assets, genMode, activeTplId, toast } =
    useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 浏览器后退/前进或手动修改 hash 时，同步到应用导航
  useEffect(() => {
    const handleHashChange = () => setNav(navFromLocation());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setNav]);

  // 页面/模板切换时主滚动容器复位到顶部，避免继承上一页滚动位置
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [nav, genMode, activeTplId]);

  if (auth === 'unauthorized') return <TokenGate />;
  if (auth === 'checking')
    return (
      <div className="grid h-screen place-items-center text-[12.5px] text-faint">加载中…</div>
    );
  if (auth === 'error')
    return (
      <div className="grid h-screen place-items-center bg-workspace-bg px-6">
        <div
          className="w-[440px] rounded-[--radius-card] border border-err/40 bg-panel p-6 text-center"
          style={{ boxShadow: 'var(--shadow-modal)' }}
        >
          <div className="mb-2 text-[15px] font-bold text-err">环境异常 · 无法连接 HitFrame API</div>
          <p className="mb-4 text-[12.5px] leading-relaxed text-dim">{bootError}</p>
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="rounded-[--radius-button] border border-accent/40 bg-accent/15 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-accent/25"
          >
            重新检测
          </button>
          <p className="mt-3 text-[11px] text-faint">
            这是环境/后端连接问题，不是功能缺失。请核对 API 进程与端口（见 README 启动口径）。
          </p>
        </div>
      </div>
    );

  // 首页=深色营销页（侧边栏隐藏），子页=浅色工作区
  const isHome = nav === 'home';
  const sidebarCollapsed = isHome;

  return (
    <div className="flex h-screen overflow-hidden bg-workspace-bg text-ink">
      {/* 桌面/平板侧边栏 (≥768px) - 首页时完全隐藏 */}
      {!sidebarCollapsed && (
        <aside
          className={cn(
            'hidden md:flex shrink-0 flex-col bg-panel border-r border-line transition-all',
            'md:w-[72px] lg:w-[224px]',
          )}
        >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 lg:px-5 pt-5 pb-4">
          <Logo size={32} />
          <span className={cn('text-[17px] font-bold text-ink', sidebarCollapsed ? 'hidden' : 'hidden lg:block')}>
            HitFrame
          </span>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setNav(item.key)}
                className={cn(
                  'mx-2 my-0.5 flex w-[calc(100%-16px)] items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-all',
                  nav === item.key
                    ? 'bg-primary-soft text-primary font-semibold'
                    : 'text-dim hover:bg-panel-muted hover:text-ink',
                  sidebarCollapsed ? 'justify-center' : 'lg:justify-start justify-center',
                )}
              >
                <Icon size={20} className="shrink-0" />
                <span className={cn('text-[14px]', sidebarCollapsed ? 'hidden' : 'hidden lg:block')}>
                  {item.label}
                </span>
                {item.key === 'assets' && assets.length > 0 && (
                  <span className={cn('ml-auto text-[11px] text-faint tabular-nums', sidebarCollapsed ? 'hidden' : 'hidden lg:block')}>
                    {assets.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部：项目切换 + 余额 */}
        <div className="p-3 border-t border-line">
          <div className={cn('mb-3', sidebarCollapsed ? 'hidden' : 'hidden lg:block')}>
            <ProjectSwitcher />
          </div>
          <div
            className={cn(
              'flex items-center gap-2 rounded-[10px] bg-panel-muted px-3 py-2.5 text-[13px] text-ink',
              sidebarCollapsed ? 'justify-center' : 'lg:justify-start justify-center',
            )}
          >
            <Coins size={16} className="shrink-0 text-warn" />
            <span className={cn(sidebarCollapsed ? 'hidden' : 'hidden lg:inline')}>余额</span>
            <b className={cn('tabular-nums', sidebarCollapsed ? 'hidden' : 'hidden lg:inline ml-auto')}>
              {balance ?? '—'}
            </b>
          </div>
        </div>
      </aside>
      )}

      {/* 移动端顶部栏 (<768px) - 首页深色随营销页，子页浅色随工作区 */}
      <div
        className={cn(
          'md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b px-4 py-3',
          isHome ? 'bg-hero-bg border-hero-line' : 'bg-panel border-line',
        )}
      >
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className={cn('text-[15px] font-bold', isHome ? 'text-hero-text' : 'text-ink')}>
            HitFrame
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 text-[12px]', isHome ? 'text-hero-text-dim' : 'text-dim')}>
            <Coins size={14} className="text-warn" />
            <b className="tabular-nums">{balance ?? '—'}</b>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={isHome ? 'text-hero-text hover:text-hero-text-dim' : 'text-ink hover:text-dim'}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* 移动端抽屉菜单 */}
      {mobileMenuOpen && (
        <div
          className={cn(
            'md:hidden fixed inset-0 z-50 backdrop-blur-sm',
            isHome ? 'bg-hero-bg/95' : 'bg-ink/40',
          )}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className={cn(
              'absolute top-0 right-0 w-64 h-full border-l p-4',
              isHome ? 'bg-hero-bg border-hero-line' : 'bg-panel border-line',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-6">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className={isHome ? 'text-hero-text-dim hover:text-hero-text' : 'text-dim hover:text-ink'}
              >
                <X size={20} />
              </button>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = nav === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setNav(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-all',
                      isHome
                        ? active
                          ? 'bg-hero-surface text-hero-text font-semibold'
                          : 'text-hero-text-dim hover:bg-hero-surface hover:text-hero-text'
                        : active
                          ? 'bg-primary-soft text-primary font-semibold'
                          : 'text-dim hover:bg-panel-muted hover:text-ink',
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[14px]">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className={cn('mt-6 pt-4 border-t', isHome ? 'border-hero-line' : 'border-line')}>
              <ProjectSwitcher />
            </div>
          </div>
        </div>
      )}

      {/* 移动端底部导航 (<768px) */}
      <div
        className={cn(
          'md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t py-2',
          isHome ? 'bg-hero-bg border-hero-line' : 'bg-panel border-line',
        )}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = nav === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setNav(item.key)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 transition-colors',
                isHome
                  ? active ? 'text-hero-text' : 'text-hero-text-dim'
                  : active ? 'text-primary' : 'text-dim',
              )}
            >
              <Icon size={20} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 主内容区 */}
      <main ref={mainRef} className="flex-1 overflow-y-auto pt-[54px] pb-[64px] md:pt-0 md:pb-0">
        {nav === 'home' && <HomePage />}
        {nav === 'generate' &&
          (genMode === 'template' && activeTplId ? (
            <TemplateConfigPage key={activeTplId} />
          ) : (
            <GeneratePage />
          ))}
        {nav === 'agent' && <AgentPage />}
        {nav === 'assets' && <AssetsPage />}
      </main>

      <AssetDetailDialog />
      {toast && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-2 text-[12px]"
          style={{ boxShadow: 'var(--shadow-floating)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
