import { useEffect, useState } from 'react';
import { Home, Sparkles, MessageSquare, FolderOpen, Menu, X, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type NavKey } from '@/store';
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

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-workspace-bg text-ink">
      {/* 桌面/平板侧边栏 (≥768px) */}
      <aside className="hidden md:flex md:w-[72px] lg:w-[224px] shrink-0 flex-col bg-hero-bg border-r border-hero-line">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 lg:px-5 pt-5 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] hf-gradient-primary text-[14px] font-extrabold text-white">
            H
          </span>
          <span className="hidden lg:block text-[17px] font-bold text-hero-text">HitFrame</span>
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
                    ? 'bg-hero-surface text-hero-text font-semibold'
                    : 'text-hero-text-dim hover:bg-hero-surface hover:text-hero-text',
                  'lg:justify-start justify-center',
                )}
              >
                <Icon size={20} className="shrink-0" />
                <span className="hidden lg:block text-[14px]">{item.label}</span>
                {item.key === 'assets' && assets.length > 0 && (
                  <span className="hidden lg:block ml-auto text-[11px] text-hero-text-dim tabular-nums">
                    {assets.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部：项目切换 + 余额 */}
        <div className="p-3 border-t border-hero-line">
          <div className="hidden lg:block mb-3">
            <ProjectSwitcher />
          </div>
          <div
            className={cn(
              'flex items-center gap-2 rounded-[10px] bg-hero-surface px-3 py-2.5 text-[13px] text-hero-text',
              'lg:justify-start justify-center',
            )}
          >
            <Coins size={16} className="shrink-0 text-warn" />
            <span className="hidden lg:inline">余额</span>
            <b className="hidden lg:inline ml-auto tabular-nums">{balance ?? '—'}</b>
          </div>
        </div>
      </aside>

      {/* 移动端顶部栏 (<768px) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-hero-bg border-b border-hero-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[8px] hf-gradient-primary text-[13px] font-extrabold text-white">
            H
          </span>
          <span className="text-[15px] font-bold text-hero-text">HitFrame</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px] text-hero-text-dim">
            <Coins size={14} className="text-warn" />
            <b className="tabular-nums">{balance ?? '—'}</b>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-hero-text hover:text-hero-text-dim"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* 移动端抽屉菜单 */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-hero-bg/95 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute top-0 right-0 w-64 h-full bg-hero-bg border-l border-hero-line p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-6">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-hero-text-dim hover:text-hero-text"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
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
                      nav === item.key
                        ? 'bg-hero-surface text-hero-text font-semibold'
                        : 'text-hero-text-dim hover:bg-hero-surface hover:text-hero-text',
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[14px]">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-6 pt-4 border-t border-hero-line">
              <ProjectSwitcher />
            </div>
          </div>
        </div>
      )}

      {/* 移动端底部导航 (<768px) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-hero-bg border-t border-hero-line py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setNav(item.key)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 transition-colors',
                nav === item.key ? 'text-hero-text' : 'text-hero-text-dim',
              )}
            >
              <Icon size={20} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto pt-[54px] pb-[64px] md:pt-0 md:pb-0">
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
