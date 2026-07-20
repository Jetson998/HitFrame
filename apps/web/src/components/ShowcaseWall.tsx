import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store';

interface ShowcaseWallProps {
  /** 未登录态：不显示「用这个提示词」按钮 */
  interactive?: boolean;
  /** 列数紧凑模式（TokenGate 页用） */
  compact?: boolean;
}

/**
 * 灵感/案例墙：未登录页与「已登录未有产出」空态展示真实生成案例。
 * 数据来自公开端点 GET /showcase（打了 showcase 标的生成结果 + 完整提示词）。
 */
export function ShowcaseWall({ interactive = true, compact = false }: ShowcaseWallProps) {
  const { showcase, loadShowcase, tryPrompt } = useAppStore();

  useEffect(() => {
    if (showcase.length === 0) void loadShowcase();
  }, [showcase.length, loadShowcase]);

  if (showcase.length === 0) return null;

  return (
    <div>
      <div className="mb-3.5 flex items-baseline justify-between">
        <span className="text-[12px] font-semibold tracking-wider text-faint uppercase">
          灵感 · 案例
        </span>
        <span className="text-[11px] text-faint">全部由 HitFrame 真实生成，附完整提示词</span>
      </div>
      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-4'
            : 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4'
        }
      >
        {showcase.map((s) => (
          <div
            key={s.id}
            className="group relative overflow-hidden rounded-xl border border-line bg-panel transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_8px_24px_rgba(23,43,77,0.12)]"
          >
            <img src={s.url} alt={s.title} className="aspect-square w-full bg-stage object-cover" />
            <div className="px-2.5 py-2 text-[11.5px] font-medium text-ink">{s.title}</div>
            {s.prompt && (
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[rgba(20,28,44,0.92)] via-[rgba(20,28,44,0.55)] to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="mb-2 line-clamp-4 text-[11px] leading-relaxed text-white/90">
                  {s.prompt}
                </div>
                {interactive && s.mode === 't2i' && (
                  <button
                    type="button"
                    onClick={() => tryPrompt(s.prompt!)}
                    className="inline-flex cursor-pointer items-center gap-1 self-start rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-accent-hov"
                  >
                    <Sparkles size={11} /> 用这个提示词
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
