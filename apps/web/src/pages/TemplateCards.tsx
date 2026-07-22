import { useState } from 'react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SCENE_ICON: Record<string, string> = { bg: '🎨', poster: '📕', model: '👗' };

/** 场景分类：sceneType → 分类键（S5 模板卡筛选） */
const SCENE_CATEGORY: Record<string, CategoryKey> = {
  bg: 'product',
  model: 'people',
  poster: 'marketing',
};

type CategoryKey = 'all' | 'product' | 'people' | 'marketing';
const CATEGORIES: Array<{ key: CategoryKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'product', label: '商品场景' },
  { key: 'people', label: '人物服饰' },
  { key: 'marketing', label: '营销封面' },
];

/** M2b 计划型创作预告（PlanTemplate 层，不可点） */
const SOON = [
  {
    icon: '🖼️',
    name: '小红书 6 图套装',
    note: 'M2b · 计划型创作',
    desc: '产品 + 卖点 + 参考笔记，直出结构化套图',
  },
  { icon: '📣', name: '促销海报', note: '规划中', desc: '产品 + 文案 + 日期，营销节点批量出' },
  { icon: '📦', name: '产品包装样机', note: '规划中', desc: '平面稿 + 包装类型，快速出包装效果' },
];

/** 场景模板卡片墙：数据来自 GET /templates（模板数据化，前端不硬编码流程） */
export function TemplateCards() {
  const { templates, setActiveTplId } = useAppStore();
  const [category, setCategory] = useState<CategoryKey>('all');

  const filtered =
    category === 'all'
      ? templates
      : templates.filter((t) => SCENE_CATEGORY[t.sceneType] === category);

  return (
    <div>
      <p className="mt-0 mb-3.5 text-[12.5px] text-dim">
        模板 = 图片槽位 + 业务变量，预置好出图流程，填空即用。
      </p>

      {/* 分类筛选 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[12px] transition-colors',
              category === c.key
                ? 'border-accent/40 bg-accent/15 font-semibold text-ink'
                : 'border-line bg-panel text-dim hover:border-accent/30 hover:text-ink',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl) => {
          const requiredSlots = tpl.slots.filter((s) => s.required !== false).length;
          const optionalSlots = tpl.slots.length - requiredSlots;
          return (
            <div
              key={tpl.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-all hover:-translate-y-0.5 hover:border-accent"
            >
              <div className="relative grid aspect-[16/10] place-items-center bg-panel2 text-4xl">
                {SCENE_ICON[tpl.sceneType] ?? '🧩'}
                <span className="absolute top-2.5 right-2.5 rounded-full border border-line bg-white/85 px-2 py-0.5 text-[10.5px] text-dim backdrop-blur-sm">
                  图片槽位 × {tpl.slots.length}
                  {optionalSlots > 0 && `（${requiredSlots} 必填）`}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="text-[15px] font-bold">{tpl.title}</div>
                <div className="mt-1.5 mb-2.5 flex-1 text-[12px] leading-relaxed text-dim">
                  {tpl.description}
                </div>
                {/* 变量摘要：让用户预判需要填什么 */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {tpl.varsSchema.slice(0, 4).map((v) => (
                    <span
                      key={v.key}
                      className="rounded border border-line-soft bg-panel2 px-1.5 py-0.5 text-[10px] text-faint"
                    >
                      {v.label}
                      {v.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
                <Button variant="primary" className="w-full" onClick={() => setActiveTplId(tpl.id)}>
                  使用模板
                </Button>
              </div>
            </div>
          );
        })}
        {/* 「全部」视图才展示 M2b 预告，避免污染分类结果 */}
        {category === 'all' &&
          SOON.map((s) => (
            <div
              key={s.name}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel opacity-55"
            >
              <div className="grid aspect-[16/10] place-items-center bg-panel2 text-4xl">
                {s.icon}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2 text-[15px] font-bold">
                  {s.name}
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-normal text-faint">
                    {s.note}
                  </span>
                </div>
                <div className="mt-1.5 mb-3 flex-1 text-[12px] leading-relaxed text-dim">
                  {s.desc}
                </div>
                <Button className="w-full" disabled>
                  即将上线
                </Button>
              </div>
            </div>
          ))}
      </div>

      {templates.length === 0 ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn/10 px-4 py-6 text-center text-[12.5px] text-warn">
          模板数据未加载。这通常是 API 未连接或数据库未 seed，
          <br />
          请检查 HitFrame API 是否运行并执行过 <code className="text-ink">node scripts/seed.mjs</code>。
        </div>
      ) : (
        filtered.length === 0 && (
          <div className="mt-8 text-center text-[12.5px] text-faint">该分类下暂无模板</div>
        )
      )}
    </div>
  );
}
