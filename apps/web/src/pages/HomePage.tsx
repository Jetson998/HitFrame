import { Sparkles, MessageSquare, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { homeCopy } from '@/design-tokens';

const TEMPLATE_CARDS = [
  {
    id: 'tpl_bg',
    title: '商品换背景',
    description: '上传商品图，选择背景与光线风格',
    badge: '最常用',
    slots: 1,
    pointsFrom: 2,
  },
  {
    id: 'tpl_model',
    title: '模特上身 / 真人试穿',
    description: '服装平铺图生成真人试穿效果',
    slots: 2,
    pointsFrom: 2,
  },
  {
    id: 'tpl_poster',
    title: '电商海报 / 小红书封面',
    description: '产品图 + 文案生成营销封面',
    slots: 1,
    pointsFrom: 2,
  },
];

/**
 * 获取资产商业展示名
 * - template-* → 对应模板标题
 * - t2i-* → 文生图作品
 * - i2i-* → 参考图创作
 * - 其他 → 未命名作品
 */
function getAssetDisplayName(asset: { name: string; type: string }, templates: { id: string; title: string }[]): string {
  const name = asset.name;

  // 模板生成作品 - 查找模板标题
  if (name.startsWith('template-')) {
    const tplId = name.substring(0, name.lastIndexOf('-'));
    const template = templates.find((t) => t.id === tplId);
    if (template) {
      return template.title;
    }
    return '场景模板作品';
  }

  // 文生图作品
  if (name.startsWith('t2i-')) {
    return '文生图作品';
  }

  // 图生图作品
  if (name.startsWith('i2i-')) {
    return '参考图创作';
  }

  // 其他
  return name || '未命名作品';
}

export function HomePage() {
  const { setNav, setGenMode, setActiveTplId, assets, templates, openDetail, balance } = useAppStore();
  const results = assets.filter((a) => a.type === 'result').slice(0, 4);

  const goTemplate = (tplId?: string) => {
    setGenMode('template');
    setActiveTplId(tplId || null);
    setNav('generate');
  };

  const goAgent = () => {
    setNav('agent');
  };

  const goMode = (mode: 'i2i' | 't2i') => {
    setGenMode(mode);
    setActiveTplId(null);
    setNav('generate');
  };

  return (
    <div className="min-h-full">
      {/* 首页浮动导航 - 桌面显示完整导航,移动端只显示品牌 */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 z-50 bg-hero-bg/95 backdrop-blur-sm border-b border-hero-line">
        <div
          className="mx-auto flex items-center justify-between py-3 px-5 md:px-8 lg:px-12"
          style={{
            maxWidth: 'var(--spacing-contentMax)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] hf-gradient-primary text-[14px] font-extrabold text-white">
              H
            </span>
            <span className="text-[17px] font-bold text-hero-text">HitFrame</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setNav('generate')}
              className="text-[14px] text-hero-text-dim hover:text-hero-text transition-colors"
            >
              AI 图片
            </button>
            <button
              type="button"
              onClick={() => setNav('agent')}
              className="text-[14px] text-hero-text-dim hover:text-hero-text transition-colors"
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => setNav('assets')}
              className="text-[14px] text-hero-text-dim hover:text-hero-text transition-colors"
            >
              资产库
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[--radius-pill] bg-hero-surface text-[13px] text-hero-text">
              <Sparkles size={14} className="text-warn" />
              <b className="tabular-nums">{balance ?? '—'}</b>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero - 深色区，需要 pt 为导航留空间 */}
      <section className="bg-hero-bg border-b border-hero-line md:pt-[64px] px-5 md:px-8 lg:px-12">
        <div
          className="mx-auto grid gap-12 lg:grid-cols-[54fr_46fr] items-center py-12 md:py-16 lg:py-16"
          style={{
            maxWidth: 'var(--spacing-contentMax)',
          }}
        >
          {/* 左侧：价值定位 */}
          <div>
            <Badge variant="hero" size="default" className="mb-4">
              {homeCopy.badge}
            </Badge>
            <h1
              className="text-hero-text font-bold mb-5"
              style={{
                fontSize: 'clamp(32px, 5vw, 52px)',
                lineHeight: 1.08,
                letterSpacing: '-0.035em',
              }}
            >
              {homeCopy.heroTitle}
            </h1>
            <p className="text-hero-text-dim text-[17px] leading-[1.7] mb-8">
              {homeCopy.heroSubtitle}
            </p>
            <div className="flex flex-wrap gap-3 mb-6">
              <Button variant="primary" size="xl" onClick={() => goTemplate()}>
                <Sparkles size={18} />
                {homeCopy.heroPrimaryCTA}
              </Button>
              <Button
                variant="secondary"
                size="xl"
                onClick={goAgent}
                className="bg-hero-surface border-hero-line text-hero-text hover:bg-hero-surface-hover hover:border-hero-line"
              >
                <MessageSquare size={18} />
                {homeCopy.heroSecondaryCTA}
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-hero-text-dim">
              {homeCopy.heroProof.map((text, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：三图组合（暂用占位） - 桌面版 */}
          <div className="hidden lg:grid grid-cols-2 gap-3 max-w-[500px]">
            <div className="space-y-3">
              <Card
                variant="hero"
                padding="none"
                className="aspect-square overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-hero-surface to-hero-bg flex items-center justify-center text-hero-text-dim text-[12px]">
                  原图占位
                </div>
                <Badge
                  variant="hero"
                  size="sm"
                  className="absolute top-2 left-2 backdrop-blur-sm bg-hero-bg/80"
                >
                  原图
                </Badge>
              </Card>
              <Card
                variant="hero"
                padding="none"
                className="aspect-square overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-hero-text-dim text-[12px]">
                  换背景占位
                </div>
                <Badge
                  variant="hero"
                  size="sm"
                  className="absolute top-2 left-2 backdrop-blur-sm bg-hero-bg/80"
                >
                  场景模板
                </Badge>
              </Card>
            </div>
            <div className="flex items-center">
              <Card
                variant="hero"
                padding="none"
                className="w-full aspect-[3/4] overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center text-hero-text-dim text-[12px]">
                  营销封面占位
                </div>
                <Badge
                  variant="hero"
                  size="sm"
                  className="absolute top-2 left-2 backdrop-blur-sm bg-hero-bg/80"
                >
                  营销封面
                </Badge>
              </Card>
            </div>
          </div>

          {/* 移动端：精简效果图（原图 → 换背景） */}
          <div className="lg:hidden grid w-full max-w-[400px] grid-cols-2 gap-3 mx-auto mt-8">
            <Card
              variant="hero"
              padding="none"
              className="aspect-square overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-hero-surface to-hero-bg flex items-center justify-center text-hero-text-dim text-[11px]">
                原图占位
              </div>
              <Badge
                variant="hero"
                size="sm"
                className="absolute top-2 left-2 backdrop-blur-sm bg-hero-bg/80"
              >
                原图
              </Badge>
            </Card>
            <Card
              variant="hero"
              padding="none"
              className="aspect-square overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-hero-text-dim text-[11px]">
                换背景占位
              </div>
              <Badge
                variant="hero"
                size="sm"
                className="absolute top-2 left-2 backdrop-blur-sm bg-hero-bg/80"
              >
                场景模板
              </Badge>
            </Card>
          </div>
        </div>
      </section>

      {/* 快速开始 - 浅色区 */}
      <section className="mx-auto px-5 md:px-8 lg:px-12 py-16 md:py-20" style={{ maxWidth: 'var(--spacing-contentMax)' }}>
        <div className="mb-6">
          <h2 className="text-[24px] font-bold mb-1.5">{homeCopy.quickStartTitle}</h2>
          <p className="text-[14px] text-dim">{homeCopy.quickStartSubtitle}</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {TEMPLATE_CARDS.map((tpl) => {
            const actual = templates.find((t) => t.id === tpl.id);
            const totalSlots = actual?.slots?.length ?? tpl.slots;
            const requiredSlots = actual?.slots?.filter((s: any) => s.required).length ?? tpl.slots;
            const slotsText = requiredSlots === totalSlots
              ? `${requiredSlots} 个必填素材`
              : `${requiredSlots} 个必填素材 · ${totalSlots} 个图片槽位`;

            return (
              <Card
                key={tpl.id}
                variant="default"
                padding="none"
                interactive
                className="flex flex-col overflow-hidden"
                onClick={() => goTemplate(tpl.id)}
              >
                {/* 封面占位 */}
                <div className="aspect-[16/10] bg-panel-muted flex items-center justify-center border-b border-line">
                  <ImageIcon size={48} className="text-faint" />
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  {tpl.badge && (
                    <Badge variant="primary" size="sm" className="mb-2 self-start">
                      {tpl.badge}
                    </Badge>
                  )}
                  <h3 className="text-[16px] font-semibold mb-1.5">{tpl.title}</h3>
                  <p className="text-[13px] text-dim leading-relaxed mb-3 flex-1">
                    {tpl.description}
                  </p>
                  <div className="flex items-center justify-between text-[12px] text-faint mb-3">
                    <span>{slotsText}</span>
                    <span>{tpl.pointsFrom} 点起</span>
                  </div>
                  <Button variant="primary" size="default" className="w-full">
                    使用模板
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* 其他创作方式 */}
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-dim">其他创作方式</span>
          <button
            type="button"
            onClick={() => goMode('t2i')}
            className="flex items-center gap-1.5 text-primary hover:text-primary-hover transition-colors"
          >
            空白文生图
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => goMode('i2i')}
            className="flex items-center gap-1.5 text-primary hover:text-primary-hover transition-colors"
          >
            参考图生图
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* 最近创作 */}
      {results.length > 0 && (
        <section className="mx-auto border-t border-line px-5 md:px-8 lg:px-12 py-16 md:py-20" style={{ maxWidth: 'var(--spacing-contentMax)' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[24px] font-bold">{homeCopy.recentTitle}</h2>
            <button
              type="button"
              onClick={() => setNav('assets')}
              className="flex items-center gap-1 text-[13px] text-primary hover:text-primary-hover transition-colors"
            >
              查看全部
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {results.map((a) => (
              <Card
                key={a.id}
                variant="default"
                padding="none"
                interactive
                className="overflow-hidden"
                onClick={() => openDetail(a)}
              >
                <img
                  src={a.url}
                  alt={getAssetDisplayName(a, templates)}
                  className="aspect-square w-full object-cover bg-panel-muted"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'grid';
                  }}
                />
                <div className="hidden aspect-square w-full place-items-center bg-panel-muted text-faint">
                  <div className="text-center">
                    <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
                    <div className="text-[11px]">图片暂不可用</div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[13px] text-ink font-medium truncate mb-0.5">
                    {getAssetDisplayName(a, templates)}
                  </div>
                  <div className="text-[11px] text-faint">
                    {new Date(a.createdAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 空状态 */}
      {results.length === 0 && (
        <section className="mx-auto border-t border-line px-5 md:px-8 lg:px-12 py-16 md:py-20" style={{ maxWidth: 'var(--spacing-contentMax)' }}>
          <Card variant="muted" padding="lg" className="text-center">
            <ImageIcon size={48} className="mx-auto mb-3 text-faint" />
            <p className="text-[14px] text-dim">{homeCopy.emptyState.noAssets}</p>
          </Card>
        </section>
      )}

      {/* 精选案例（暂用占位） */}
      <section className="mx-auto border-t border-line bg-panel-muted/50 px-5 md:px-8 lg:px-12 py-16 md:py-20" style={{ maxWidth: 'var(--spacing-contentMax)' }}>
        <div className="mb-6">
          <h2 className="text-[24px] font-bold mb-1.5">{homeCopy.showcaseTitle}</h2>
          <p className="text-[14px] text-dim">{homeCopy.showcaseSubtitle}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} variant="default" padding="default">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="aspect-square rounded-[--radius-image] bg-panel-muted flex items-center justify-center">
                  <span className="text-[11px] text-faint">原始素材</span>
                </div>
                <div className="aspect-square rounded-[--radius-image] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                  <span className="text-[11px] text-faint">生成结果</span>
                </div>
              </div>
              <h3 className="text-[14px] font-semibold mb-1">案例 {i} 占位</h3>
              <p className="text-[12px] text-dim mb-3">商品换背景 · 1:1</p>
              <Button variant="secondary" size="sm" className="w-full">
                使用这个模板
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
