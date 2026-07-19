import { useEffect } from 'react';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type NavKey } from '@/store';
import { TokenGate } from '@/components/TokenGate';
import { AssetDetailDialog } from '@/components/AssetDetailDialog';
import { HomePage } from '@/pages/HomePage';
import { GeneratePage } from '@/pages/GeneratePage';
import { TemplateConfigPage } from '@/pages/TemplateConfigPage';
import { AssetsPage } from '@/pages/AssetsPage';

const NAV_ITEMS: Array<{ key: NavKey; icon: string; label: string; disabled?: boolean }> = [
  { key: 'home', icon: '🏠', label: '首页' },
  { key: 'generate', icon: '✨', label: 'AI 图片' },
  { key: 'agent', icon: '🤖', label: 'Agent', disabled: true }, // M2a 开放
  { key: 'assets', icon: '🗂️', label: '资产库' },
];

export default function App() {
  const { nav, setNav, auth, bootstrap, balance, assets, genMode, activeTplId, toast } =
    useAppStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (auth === 'unauthorized') return <TokenGate />;
  if (auth === 'checking')
    return <div className="grid h-screen place-items-center text-[12.5px] text-faint">加载中…</div>;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-vio text-[13px] font-extrabold text-white">
            H
          </span>
          <span className="text-[15px] font-bold tracking-wide">HitFrame</span>
          <span className="rounded-full border border-line px-1.5 py-px text-[10px] text-faint">
            M1
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto pb-2">
          <div className="px-4.5 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-widest text-faint uppercase">
            创作
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => setNav(item.key)}
              className={cn(
                'mx-2 my-px flex w-[calc(100%-16px)] cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-[12.5px] text-dim transition-colors',
                nav === item.key && 'border-accent/35 bg-accent/15 font-semibold text-ink',
                !item.disabled && nav !== item.key && 'hover:bg-panel2 hover:text-ink',
                item.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              <span className="w-5 text-center text-sm">{item.icon}</span>
              {item.label}
              {item.disabled && <span className="ml-auto text-[10px] text-faint">即将上线</span>}
              {item.key === 'assets' && (
                <span className="ml-auto text-[10.5px] text-faint">({assets.length})</span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-line-soft p-3">
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-panel2 px-3 py-2 text-[12px]">
            <Coins size={14} className="text-warn" />
            点数余额
            <b className="ml-auto">{balance ?? '—'}</b>
          </div>
          <div className="mt-2.5 flex items-center gap-2 px-0.5 text-[11px] text-faint">
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-warn/25 text-[11px]">
              黄
            </span>
            HitFrame Dev · 单租户
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {nav === 'home' && <HomePage />}
        {nav === 'generate' &&
          (genMode === 'template' && activeTplId ? (
            <TemplateConfigPage key={activeTplId} />
          ) : (
            <GeneratePage />
          ))}
        {nav === 'assets' && <AssetsPage />}
      </main>

      <AssetDetailDialog />
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-line bg-panel2 px-4 py-2 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          {toast}
        </div>
      )}
    </div>
  );
}
