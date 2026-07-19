import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';

const FILTERS = [
  ['all', '全部'],
  ['source', '上传素材'],
  ['result', '生成结果'],
] as const;

/** 资产库（阶段 5 轻量版：列表 / 筛选 / 搜索 / 详情 / 再次引用；项目归档与管理为阶段 6） */
export function AssetsPage() {
  const { assets, refreshAssets, openDetail, showToast } = useAppStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = assets.filter(
    (a) => (filter === 'all' || a.type === filter) && (!q || a.name.includes(q)),
  );

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
            className="h-9 w-52 rounded-[9px] border border-line bg-panel2 px-3 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
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
                await api.upload(f);
                await refreshAssets();
                showToast(`已上传「${f.name}」`);
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

      <div className="mb-4 flex gap-1.5">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-[11.5px]',
              filter === key
                ? 'border-accent/50 bg-accent/15 font-semibold text-ink'
                : 'border-line-soft bg-panel2 text-dim hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-faint">
          {rows.length} 项 · 项目归档 / 删除 / 批量操作于阶段 6 提供
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-line text-[12.5px] text-faint">
          还没有资产，先上传一张素材或生成一张图
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openDetail(a)}
              className="cursor-pointer overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-accent"
            >
              <img
                src={a.url}
                alt={a.name}
                className="aspect-square w-full bg-[#0c1017] object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11.5px] text-dim">
                <span className="truncate">{a.name}</span>
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
