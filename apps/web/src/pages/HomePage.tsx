import { useAppStore, type GenMode } from '@/store';

const QUICK: Array<{ icon: string; label: string; mode?: GenMode; nav?: 'assets' }> = [
  { icon: '✨', label: '空白文生图', mode: 't2i' },
  { icon: '🖼️', label: '参考图生图', mode: 'i2i' },
  { icon: '🧩', label: '场景模板出图', mode: 'template' },
  { icon: '🗂️', label: '最近生成结果', nav: 'assets' },
];

export function HomePage() {
  const { setNav, setGenMode, setActiveTplId, assets, templates, openDetail } = useAppStore();
  const results = assets.filter((a) => a.type === 'result').slice(0, 8);

  const go = (item: (typeof QUICK)[number]) => {
    if (item.nav) {
      setNav(item.nav);
      return;
    }
    setGenMode(item.mode!);
    setActiveTplId(null);
    setNav('generate');
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-10">
      <h1 className="m-0 text-[24px] font-bold">告诉 HitFrame 你要做什么</h1>
      <p className="mt-2 mb-6 text-[14px] leading-relaxed text-dim">
        素材 → 场景 → 出图：上传商品图或底图，选一种出图方式，分钟级拿到可用成图。
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => go(q)}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-4 text-left text-[13px] transition-all hover:-translate-y-0.5 hover:border-accent"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-vio text-base">
              {q.icon}
            </span>
            {q.label}
            <span className="ml-auto text-faint">→</span>
          </button>
        ))}
      </div>

      <div className="mt-9 mb-3.5 text-[12px] font-semibold tracking-wider text-faint uppercase">
        推荐模板
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => {
              setGenMode('template');
              setActiveTplId(tpl.id);
              setNav('generate');
            }}
            className="cursor-pointer rounded-2xl border border-line bg-panel p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent"
          >
            <div className="text-[14.5px] font-bold">🎨 {tpl.title}</div>
            <div className="mt-1.5 text-[12px] leading-relaxed text-dim">{tpl.description}</div>
          </button>
        ))}
      </div>

      {results.length > 0 && (
        <>
          <div className="mt-9 mb-3.5 text-[12px] font-semibold tracking-wider text-faint uppercase">
            最近生成
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openDetail(a)}
                className="cursor-pointer overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-accent"
              >
                <img src={a.url} alt={a.name} className="aspect-square w-full object-cover" />
                <div className="truncate px-2.5 py-2 text-left text-[11.5px] text-dim">
                  {a.name}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
