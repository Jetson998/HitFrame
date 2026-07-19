import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';

const SCENE_ICON: Record<string, string> = { bg: '🎨', cover: '📕', model: '👗' };

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
      <p className="mt-0 mb-3.5 text-[12.5px] text-dim">
        模板 = 图片槽位 + 业务变量，预置好出图流程，填空即用。
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-all hover:-translate-y-0.5 hover:border-accent"
          >
            <div className="relative grid aspect-[16/10] place-items-center bg-panel2 text-4xl">
              {SCENE_ICON[tpl.sceneType] ?? '🧩'}
              <span className="absolute top-2.5 right-2.5 rounded-full border border-line bg-[rgba(14,17,22,0.8)] px-2 py-0.5 text-[10.5px]">
                图片槽位 × {tpl.slots.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="text-[15px] font-bold">{tpl.title}</div>
              <div className="mt-1.5 mb-3 flex-1 text-[12px] leading-relaxed text-dim">
                {tpl.description}
              </div>
              <Button variant="primary" className="w-full" onClick={() => setActiveTplId(tpl.id)}>
                使用模板
              </Button>
            </div>
          </div>
        ))}
        {SOON.map((s) => (
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
    </div>
  );
}
