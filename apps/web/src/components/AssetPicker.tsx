import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';

interface AssetPickerProps {
  label: string;
  required?: boolean;
  value: string | null; // assetId
  onChange: (assetId: string | null) => void;
}

/**
 * 图片槽位选择器：点击上传，或从资产缩略图行选一张。
 * 生成结果（type=result）同样可选 —— 「再次引用」闭环。
 */
export function AssetPicker({ label, required, value, onChange }: AssetPickerProps) {
  const { assets, currentProjectId, refreshAssets, showToast } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const selected = assets.find((a) => a.id === value) ?? null;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { assetId } = await api.upload(file, currentProjectId);
      await refreshAssets();
      onChange(assetId);
      showToast(`已上传「${file.name}」并存入资产库`);
    } catch (err) {
      showToast(`上传失败：${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="mb-2 text-[11.5px] font-semibold text-dim">
        {label} {required && <span className="text-primary">*</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          'grid aspect-[16/9] w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-panel-muted text-[11.5px] text-faint transition-colors hover:border-primary hover:text-dim',
          selected && 'border-solid',
        )}
      >
        {uploading ? (
          <span>上传中…</span>
        ) : selected ? (
          <img src={selected.url} alt={selected.name} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1.5">
            <Upload size={18} />
            点击上传（png / jpg / webp），或从下方资产选一张
          </span>
        )}
      </button>
      {assets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {assets.slice(0, 12).map((a) => (
            <button
              key={a.id}
              type="button"
              title={`${a.name}（${a.type === 'source' ? '素材' : '生成'}）`}
              onClick={() => onChange(a.id === value ? null : a.id)}
              className={cn(
                'h-11 w-11 cursor-pointer overflow-hidden rounded-lg border transition-colors',
                a.id === value ? 'border-primary' : 'border-line-soft hover:border-line',
              )}
            >
              <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
