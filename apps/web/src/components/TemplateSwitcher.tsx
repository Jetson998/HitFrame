import type { TemplateSummaryDto } from '@hitframe/shared';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 首页与场景模板工作台共用的商业化标题和简短说明。 */
export const TEMPLATE_PRESENTATION: Record<
  string,
  {
    title: string;
    description: string;
    cardTitle: string;
    cardDescription: string;
    examplePrompt?: string;
    exampleVars?: Record<string, string>;
    referenceRoles?: string[];
  }
> = {
  tpl_bg: {
    title: '商品换背景',
    description: '上传商品图，选择背景与光线风格',
    cardTitle: '动漫形象生成',
    cardDescription: '参考图生成富有动感的动漫视觉',
    examplePrompt:
      '保持 @图片 1 的人物主体、面部特征、发型与服装轮廓不变，将其转化为高质感动漫形象；加入霓虹紫蓝光影与未来感街头氛围，动态构图，细节清晰，适合角色海报',
    referenceRoles: ['人物 / 角色参考'],
  },
  tpl_model: {
    title: '模特上身 / 真人试穿',
    description: '服装平铺图生成真人试穿效果',
    cardTitle: '模特穿搭效果',
    cardDescription: '服装平铺图生成真人穿搭效果',
    examplePrompt:
      '保持 @图片 1 的服装版型、颜色、材质与标识；如添加模特参考图，保持人物身份、面部和体态，生成自然可信的穿搭效果，画面干净，适合电商展示',
    referenceRoles: ['服装 / 商品', '模特参考'],
  },
  tpl_poster: {
    title: '电商海报 / 小红书封面',
    description: '产品图 + 文案生成营销封面',
    cardTitle: '美妆电商主图',
    cardDescription: '产品原图生成高质感电商主图',
    examplePrompt: '保持 @图片 1 的产品外观与品牌文字，形成完整饱满、画面清晰有质感的营销视觉',
    exampleVars: { title: '夏日新品', sellingPoint: '限时优惠' },
    referenceRoles: ['商品主体'],
  },
};

/** 右侧示例卡使用原图 + 生成图，作为模板效果预览。 */
export const TEMPLATE_EXAMPLES: Record<string, { before: string; after: string }> = {
  tpl_poster: {
    before: '/demo/chanel-origin.png',
    after: '/demo/chanel-model.png',
  },
  tpl_model: {
    before: '/demo/ref-model2.png',
    after: '/demo/tryon-real3-full.png',
  },
  tpl_bg: {
    before: '/demo/user-street-pick.png',
    after: '/demo/d2-street-bg-1-fixed.png',
  },
};

export const TEMPLATE_COVER: Record<string, string> = {
  tpl_bg: '/demo/d2-street-bg-1-fixed.png',
  tpl_model: '/demo/tryon-real3-full.png',
  tpl_poster: '/demo/chanel-model.png',
};

export function templatePresentation(tpl: TemplateSummaryDto) {
  return {
    title: TEMPLATE_PRESENTATION[tpl.id]?.title ?? tpl.title,
    description:
      TEMPLATE_PRESENTATION[tpl.id]?.description ?? tpl.description ?? '选择素材，快速生成商业视觉',
    cardTitle: TEMPLATE_PRESENTATION[tpl.id]?.cardTitle ?? tpl.title,
    cardDescription:
      TEMPLATE_PRESENTATION[tpl.id]?.cardDescription ??
      tpl.description ??
      '选择素材，快速生成商业视觉',
    examplePrompt: TEMPLATE_PRESENTATION[tpl.id]?.examplePrompt,
    exampleVars: TEMPLATE_PRESENTATION[tpl.id]?.exampleVars,
    referenceRoles:
      TEMPLATE_PRESENTATION[tpl.id]?.referenceRoles ?? tpl.slots.map((slot) => slot.label),
  };
}

interface TemplateSwitcherProps {
  templates: TemplateSummaryDto[];
  activeTplId: string;
  onSelect: (id: string) => void;
}

/** 工作台右侧的模板切换卡片：切换后左侧表单随模板更新。 */
export function TemplateSwitcher({ templates, activeTplId, onSelect }: TemplateSwitcherProps) {
  const order = ['tpl_poster', 'tpl_model', 'tpl_bg'];
  const orderedTemplates = [...templates].sort(
    (a, b) =>
      (order.indexOf(a.id) < 0 ? order.length : order.indexOf(a.id)) -
      (order.indexOf(b.id) < 0 ? order.length : order.indexOf(b.id)),
  );

  return (
    <div role="tablist" aria-label="场景模板">
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {orderedTemplates.map((tpl) => {
          const copy = templatePresentation(tpl);
          const example = TEMPLATE_EXAMPLES[tpl.id];
          const active = tpl.id === activeTplId;
          return (
            <button
              key={tpl.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                'group min-w-0 overflow-hidden rounded-[var(--radius-control)] border text-left transition-all',
                active
                  ? 'border-primary bg-primary-soft/45 shadow-[0_3px_12px_rgba(99,91,255,0.16)]'
                  : 'border-line-soft bg-panel hover:border-primary/35 hover:shadow-[0_3px_12px_rgba(18,27,44,0.08)]',
              )}
            >
              <div className="relative grid aspect-[1.9/1] grid-cols-2 gap-1 overflow-hidden bg-panel-muted p-1">
                {example ? (
                  <>
                    <div className="relative min-w-0 overflow-hidden rounded-[calc(var(--radius-control)-2px)]">
                      <img
                        src={example.before}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-ink/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                        原图
                      </span>
                    </div>
                    <div className="relative min-w-0 overflow-hidden rounded-[calc(var(--radius-control)-2px)]">
                      <img
                        src={example.after}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute right-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        生成
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 h-full w-full" />
                )}
                {active && (
                  <span className="absolute right-2 bottom-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-white shadow-sm">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <div className="truncate text-[13px] font-semibold text-ink">{copy.cardTitle}</div>
                <div className="mt-0.5 truncate text-[10.5px] text-dim">{copy.cardDescription}</div>
                <div className="mt-2 border-t border-line-soft pt-2 text-center text-[11px] font-medium text-primary">
                  使用此效果
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
