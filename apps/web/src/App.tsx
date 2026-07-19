import { useAppStore, NavKey } from './store';

const NAV_ITEMS: Array<{ key: NavKey; label: string; disabled?: boolean }> = [
  { key: 'home', label: '首页' },
  { key: 'generate', label: 'AI 图片' },
  { key: 'agent', label: 'Agent', disabled: true }, // M2a 开放
  { key: 'assets', label: '资产库' },
];

export default function App() {
  const { nav, setNav } = useAppStore();

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-52 flex-col border-r border-neutral-800 p-4">
        <div className="mb-6 text-lg font-bold">HitFrame</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={() => setNav(item.key)}
              className={`rounded-md px-3 py-2 text-left text-sm ${
                nav === item.key ? 'bg-neutral-800 font-medium' : 'hover:bg-neutral-900'
              } ${item.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              {item.label}
              {item.disabled && <span className="ml-2 text-xs text-neutral-500">即将上线</span>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center text-neutral-500">
          <div className="mb-2 text-sm">工程骨架已就绪（阶段 1）</div>
          <div className="text-xs">
            主流程页面按 Demo 复刻，随阶段 5 交付 —— 当前视图：{nav}
          </div>
        </div>
      </main>
    </div>
  );
}
