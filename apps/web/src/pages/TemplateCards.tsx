import { ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TEMPLATE_COVER, templatePresentation } from '@/components/TemplateSwitcher';

const SCENE_ICON: Record<string, string> = { bg: '🎨', poster: '📕', model: '👗' };
const SCENE_LABEL: Record<string, string> = {
  bg: '商品场景',
  model: '人物服饰',
  poster: '营销封面',
};

/** 正式模板封面（复用首页真实图，按模板 id 映射）；未映射的回退 emoji 占位 */
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

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const copy = templatePresentation(tpl);
          const requiredSlots = tpl.slots.filter((s) => s.required !== false).length;
          const slotsText =
            requiredSlots === tpl.slots.length
              ? `${requiredSlots} 个必填素材`
              : `${requiredSlots} 个必填素材 · ${tpl.slots.length} 个图片槽位`;
          return (
            <Card
              key={tpl.id}
              variant="default"
              padding="none"
              interactive
              className="flex flex-col overflow-hidden hover:border-primary/40"
              onClick={() => setActiveTplId(tpl.id)}
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-panel-muted">
                {TEMPLATE_COVER[tpl.id] ? (
                  <img
                    src={TEMPLATE_COVER[tpl.id]}
                    alt={copy.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-4xl">
                    {SCENE_ICON[tpl.sceneType] ?? '🧩'}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <Badge variant="primary" size="sm" className="mb-2 self-start">
                  {SCENE_LABEL[tpl.sceneType] ?? '场景模板'}
                </Badge>
                <div className="text-[16px] font-semibold text-ink">{copy.title}</div>
                <div className="mt-1.5 mb-3 flex-1 text-[12.5px] leading-relaxed text-dim">
                  {copy.description}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-faint">{slotsText}</span>
                  <span className="text-[11px] text-line-strong">·</span>
                  {tpl.varsSchema.slice(0, 4).map((v) => (
                    <Badge
                      key={v.key}
                      size="sm"
                      className="border-line-soft bg-panel-muted px-1.5 py-0.5 text-[10px] text-faint"
                    >
                      {v.label}
                      {v.required ? ' *' : ''}
                    </Badge>
                  ))}
                </div>
                <Button variant="primary" className="w-full" onClick={() => setActiveTplId(tpl.id)}>
                  使用模板 <ArrowRight size={15} />
                </Button>
              </div>
            </Card>
          );
        })}
        {SOON.map((s) => (
          <div
            key={s.name}
            className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel opacity-55"
          >
            <div className="grid aspect-[16/10] place-items-center bg-panel-muted text-4xl">
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

      {templates.length === 0 && (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn/10 px-4 py-6 text-center text-[12.5px] text-warn">
          模板数据未加载。这通常是 API 未连接或数据库未 seed，
          <br />
          请检查 HitFrame API 是否运行并执行过{' '}
          <code className="text-ink">node scripts/seed.mjs</code>。
        </div>
      )}
    </div>
  );
}
