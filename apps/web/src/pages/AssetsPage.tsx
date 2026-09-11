import { useRef, useState } from 'react';
import { FolderOpen, Images, LayoutGrid, List, Sparkles, Star, Upload } from 'lucide-react';
import { api, compactAssetName, type AssetRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';

const TYPE_FILTERS = [
  ['all', '全部'],
  ['source', '上传素材'],
  ['result', '生成结果'],
] as const;

/** 资产库：上传素材与生成结果共用一套可扫描的工作区。 */
export function AssetsPage() {
  const { assets, projects, currentProjectId, refreshAssets, openDetail, showToast } =
    useAppStore();
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number][0]>('all');
  const [projFilter, setProjFilter] = useState<'all' | 'none' | string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = assets.filter(
    (a) =>
      (typeFilter === 'all' || a.type === typeFilter) &&
      (projFilter === 'all' ||
        (projFilter === 'none' ? !a.projectId : a.projectId === projFilter)) &&
      (!favoritesOnly || a.meta?.favorite === true),
  );
  const projName = (id?: string | null) => projects.find((p) => p.id === id)?.name;
  const timelineGroups = Array.from(
    rows.reduce<Map<string, AssetRow[]>>((groups, asset) => {
      const date = new Date(asset.createdAt).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      groups.set(date, [...(groups.get(date) ?? []), asset]);
      return groups;
    }, new Map()),
  );

  const toggleAssetFavorite = async (asset: AssetRow) => {
    const next = asset.meta?.favorite !== true;
    setFavoriteBusyId(asset.id);
    try {
      await api.updateAsset(asset.id, { favorite: next });
      await refreshAssets();
      showToast(next ? '已加入收藏' : '已取消收藏');
    } catch (err) {
      showToast(`收藏更新失败：${(err as Error).message}`);
    } finally {
      setFavoriteBusyId(null);
    }
  };

  const renderAssetCard = (asset: AssetRow) => (
    <article
      key={asset.id}
      className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-panel shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-card-hover)]"
    >
      <button
        type="button"
        onClick={() => openDetail(asset)}
        className="block w-full cursor-pointer text-left"
      >
        <div className="relative aspect-square overflow-hidden bg-stage">
          <img
            src={asset.url}
            alt={asset.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <span
            className={cn(
              'absolute left-2.5 top-2.5 rounded-[6px] px-2 py-1 text-[10px] font-medium backdrop-blur-sm',
              asset.type === 'source' ? 'bg-white/90 text-ok' : 'bg-primary/90 text-white',
            )}
          >
            {asset.type === 'source' ? '上传素材' : '生成结果'}
          </span>
          <span className="absolute bottom-2.5 right-2.5 rounded-[6px] bg-ink/60 px-2 py-1 text-[10px] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            查看详情
          </span>
        </div>
        <div className="min-w-0 px-3 py-3">
          <div className="truncate text-[12px] font-medium text-ink" title={asset.name}>
            {compactAssetName(asset.name)}
          </div>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10.5px] text-faint">
            <span className="truncate">
              {asset.projectId ? (projName(asset.projectId) ?? '已归类') : '未归类'}
            </span>
            <span className="shrink-0">
              {new Date(asset.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
      </button>
      <button
        type="button"
        aria-label={asset.meta?.favorite === true ? '取消收藏' : '收藏'}
        title={asset.meta?.favorite === true ? '取消收藏' : '收藏'}
        disabled={favoriteBusyId === asset.id}
        onClick={() => void toggleAssetFavorite(asset)}
        className={cn(
          'absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/92 shadow-sm backdrop-blur-sm transition-colors disabled:opacity-50',
          asset.meta?.favorite === true
            ? 'text-warn'
            : 'text-dim hover:bg-white hover:text-warn',
        )}
      >
        <Star size={14} className={asset.meta?.favorite === true ? 'fill-current' : undefined} />
      </button>
    </article>
  );

  return (
    <div className="flex min-h-full w-full flex-col bg-panel">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-soft bg-panel px-5 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <FolderOpen size={16} className="text-primary" />
          <h1 className="m-0 text-[14px] font-semibold leading-tight text-ink">资产库</h1>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await api.upload(f, currentProjectId);
              await refreshAssets();
              showToast(
                `已上传「${f.name}」${currentProjectId ? `到「${projName(currentProjectId)}」` : ''}`,
              );
            } catch (err) {
              showToast(`上传失败：${(err as Error).message}`);
            }
          }}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> 上传素材
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 py-6 md:px-8 md:py-8">
        <section
          aria-label="资产筛选"
          className="mb-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line-soft bg-panel p-2 shadow-[var(--shadow-card)]"
        >
          <div
            role="tablist"
            aria-label="资产类型"
            className="flex items-center gap-1 rounded-[10px] bg-panel-muted p-1"
          >
            {TYPE_FILTERS.map(([key, label]) => {
              const Icon = key === 'source' ? Upload : key === 'result' ? Sparkles : Images;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === key}
                  onClick={() => setTypeFilter(key)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[11.5px] font-medium transition-all',
                    typeFilter === key
                      ? 'bg-panel text-ink shadow-[0_1px_5px_rgba(18,27,44,0.10)]'
                      : 'text-dim hover:text-ink',
                  )}
                >
                  <Icon size={13} className={typeFilter === key ? 'text-primary' : 'text-faint'} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="hidden h-6 w-px bg-line-soft sm:block" />
          <button
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((value) => !value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[11.5px] font-medium transition-all',
              favoritesOnly
                ? 'bg-warn/10 text-warn'
                : 'text-dim hover:bg-panel-muted hover:text-ink',
            )}
          >
            <Star size={13} className={favoritesOnly ? 'fill-current' : 'text-faint'} />
            我的收藏
          </button>

          <div className="hidden h-6 w-px bg-line-soft sm:block" />
          <label className="flex h-10 min-w-[160px] flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-3 text-[11.5px] text-dim sm:flex-none">
            <FolderOpen size={14} className="shrink-0 text-faint" />
            <span className="shrink-0 text-faint">项目</span>
            <select
              value={projFilter}
              onChange={(e) => setProjFilter(e.target.value)}
              className="min-w-0 flex-1 cursor-pointer bg-transparent text-[11.5px] text-ink focus:outline-none"
              aria-label="按项目筛选"
            >
              <option value="all">全部项目</option>
              <option value="none">未归类</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <span className="ml-auto px-2 text-[11px] tabular-nums text-faint">{rows.length} 项</span>
          <div
            role="group"
            aria-label="资产展示方式"
            className="flex items-center gap-1 rounded-[9px] bg-panel-muted p-1"
          >
            <button
              type="button"
              aria-label="时间轴展示"
              title="时间轴展示"
              aria-pressed={viewMode === 'timeline'}
              onClick={() => setViewMode('timeline')}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-[7px] transition-all',
                viewMode === 'timeline'
                  ? 'bg-panel text-primary shadow-[0_1px_4px_rgba(18,27,44,0.10)]'
                  : 'text-faint hover:text-ink',
              )}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              aria-label="宫格展示"
              title="宫格展示"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-[7px] transition-all',
                viewMode === 'grid'
                  ? 'bg-panel text-primary shadow-[0_1px_4px_rgba(18,27,44,0.10)]'
                  : 'text-faint hover:text-ink',
              )}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="grid min-h-[360px] flex-1 place-items-center rounded-[var(--radius-card)] border border-dashed border-line bg-panel-muted/60 px-6 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[var(--radius-control)] bg-panel text-faint shadow-[var(--shadow-card)]">
                <Images size={22} />
              </div>
              <div className="text-[14px] font-semibold text-ink">还没有符合条件的资产</div>
              <p className="mt-1 text-[12px] text-faint">
                上传一张素材，或完成一次生成后会显示在这里
              </p>
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="space-y-7">
            {timelineGroups.map(([date, dateAssets]) => (
              <section key={date} aria-labelledby={`assets-${date}`}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 id={`assets-${date}`} className="text-[13px] font-semibold text-ink">
                    {date}
                  </h2>
                  <span className="text-[10.5px] tabular-nums text-faint">
                    {dateAssets.length} 项
                  </span>
                  <div className="h-px flex-1 bg-line-soft" />
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {dateAssets.map(renderAssetCard)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {rows.map(renderAssetCard)}
          </div>
        )}
      </div>
    </div>
  );
}
