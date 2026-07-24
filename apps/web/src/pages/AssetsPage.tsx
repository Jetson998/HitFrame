import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

const TYPE_FILTERS = [
  ['all', '全部'],
  ['source', '上传素材'],
  ['result', '生成结果'],
] as const;

/** 资产库（阶段 6）：类型/项目筛选、搜索、详情（改归属/删除/再次引用）、上传归入当前项目 */
export function AssetsPage() {
  const { assets, projects, currentProjectId, refreshAssets, openDetail, showToast } =
    useAppStore();
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number][0]>('all');
  const [projFilter, setProjFilter] = useState<'all' | 'none' | string>('all');
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = assets.filter(
    (a) =>
      (typeFilter === 'all' || a.type === typeFilter) &&
      (projFilter === 'all' ||
        (projFilter === 'none' ? !a.projectId : a.projectId === projFilter)) &&
      (!q || a.name.includes(q)),
  );
  const projName = (id?: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-bold">资产库</h1>
          <p className="mt-1.5 mb-0 text-[13px] text-dim">
            上传素材与生成结果统一管理；生成结果可再次引用，形成「素材 → 出图 → 沉淀」闭环。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 搜索资产名称…"
            className="h-9 w-52 rounded-[9px] border border-line bg-panel-muted px-3 text-[12.5px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
          />
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
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> 上传素材
          </Button>
        </div>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-faint">类型</span>
        {TYPE_FILTERS.map(([key, label]) => (
          <Chip key={key} active={typeFilter === key} onClick={() => setTypeFilter(key)}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-faint">项目</span>
        <Chip active={projFilter === 'all'} onClick={() => setProjFilter('all')}>
          全部
        </Chip>
        <Chip active={projFilter === 'none'} onClick={() => setProjFilter('none')}>
          未归类
        </Chip>
        {projects.map((p) => (
          <Chip key={p.id} active={projFilter === p.id} onClick={() => setProjFilter(p.id)}>
            {p.name}
          </Chip>
        ))}
        <span className="ml-auto text-[11px] text-faint">{rows.length} 项</span>
      </div>

      {rows.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-[--radius-card] border border-dashed border-line text-[12.5px] text-faint">
          没有符合条件的资产，先上传一张素材或生成一张图
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openDetail(a)}
              className="cursor-pointer overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-primary"
            >
              <img
                src={a.url}
                alt={a.name}
                className="aspect-square w-full bg-stage object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11.5px] text-dim">
                <span className="min-w-0">
                  <span className="block truncate">{a.name}</span>
                  {a.projectId && (
                    <span className="block truncate text-[10px] text-faint">
                      📁 {projName(a.projectId) ?? a.projectId}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[9.5px]',
                    a.type === 'source' ? 'bg-ok/15 text-ok' : 'bg-vio/15 text-vio',
                  )}
                >
                  {a.type === 'source' ? '素材' : '生成'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
