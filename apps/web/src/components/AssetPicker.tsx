import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_REFERENCE_IMAGES } from '@hitframe/shared';
import {
  CircleAlert,
  Eye,
  Globe2,
  Grid2X2,
  ImagePlus,
  List,
  LoaderCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { api, compactAssetName, type AssetRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface AssetPickerProps {
  label: string;
  required?: boolean;
  value: string | null; // single-slot compatibility
  onChange: (assetId: string | null) => void;
  compact?: boolean;
  showLabel?: boolean;
  /** 图生图和场景模板共用的有序多图输入；数组顺序对应图片编号。 */
  multiple?: boolean;
  values?: string[];
  onValuesChange?: (assetIds: string[]) => void;
  maxItems?: number;
  /** 只显示添加按钮；点击后直接提供上传/资产库菜单，适合对话 Composer。 */
  triggerOnly?: boolean;
  triggerLabel?: string;
}

type AssetFilter = 'all' | 'source' | 'result';
type AssetView = 'timeline' | 'grid';

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function assetTitle(asset: AssetRow) {
  return asset.name || (asset.type === 'source' ? '上传素材' : '生成作品');
}

function dateGroupLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '其他时间';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (daysAgo === 0) return '今天';
  if (daysAgo === 1) return '昨天';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function AddImageActions({
  assets,
  values,
  onSelect,
  onUpload,
  disabled,
}: {
  assets: AssetRow[];
  values: string[];
  onSelect: (assetId: string) => void;
  onUpload: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onUpload}
        disabled={disabled}
        className="inline-flex h-9 w-full items-center justify-start gap-2.5 rounded-[8px] bg-panel px-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-panel-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <Upload size={15} className="text-primary" /> 上传图片
      </button>
      <button
        type="button"
        disabled
        title="互联网图片导入将在下一阶段开放"
        className="inline-flex h-9 w-full items-center justify-start gap-2.5 rounded-[8px] bg-panel px-3 text-[11.5px] font-medium text-faint disabled:pointer-events-none disabled:opacity-60"
      >
        <Globe2 size={15} /> 互联网图片
      </button>
      <AssetLibraryDialog
        assets={assets}
        values={values}
        onSelect={onSelect}
        disabled={disabled || assets.length === 0}
      />
    </>
  );
}

function AssetLibraryDialog({
  assets,
  values,
  onSelect,
  disabled,
}: {
  assets: AssetRow[];
  values: string[];
  onSelect: (assetId: string) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [view, setView] = useState<AssetView>('timeline');
  const selectedIds = useMemo(() => new Set(values), [values]);
  const visibleAssets = useMemo(
    () =>
      assets
        .filter((asset) => filter === 'all' || asset.type === filter)
        .sort((a, b) => {
          const aTime = Date.parse(a.createdAt);
          const bTime = Date.parse(b.createdAt);
          return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
        }),
    [assets, filter],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, AssetRow[]>();
    for (const asset of visibleAssets) {
      const key = dateGroupLabel(asset.createdAt);
      const group = grouped.get(key) ?? [];
      group.push(asset);
      grouped.set(key, group);
    }
    return [...grouped.entries()];
  }, [visibleAssets]);

  const assetCard = (asset: AssetRow) => (
    <DialogClose asChild key={asset.id}>
      <button
        type="button"
        aria-pressed={selectedIds.has(asset.id)}
        title={assetTitle(asset)}
        onClick={() => onSelect(asset.id)}
        className={cn(
          'min-w-0 overflow-hidden rounded-[var(--radius-control)] border bg-panel text-left transition-colors hover:border-line-strong',
          selectedIds.has(asset.id) ? 'border-primary' : 'border-line-soft',
        )}
      >
        <img
          src={asset.url}
          alt={assetTitle(asset)}
          className="aspect-square w-full bg-panel-muted object-cover"
        />
        <span className="block truncate px-2 py-1.5 text-[10.5px] text-dim">
          <span title={assetTitle(asset)}>{compactAssetName(assetTitle(asset))}</span>
        </span>
      </button>
    </DialogClose>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 w-full items-center justify-start gap-2.5 rounded-[8px] bg-panel px-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-panel-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <Grid2X2 size={15} className="text-dim" /> 资产库
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-32px)] w-[calc(100%-24px)] max-w-[620px] overflow-hidden rounded-[var(--radius-card)]">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle className="text-[16px] font-semibold text-ink">选择参考图</DialogTitle>
            <button
              type="button"
              aria-label={view === 'timeline' ? '切换宫格视图' : '切换时间轴视图'}
              title={view === 'timeline' ? '宫格视图' : '时间轴视图'}
              onClick={() => setView((current) => (current === 'timeline' ? 'grid' : 'timeline'))}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-panel px-2.5 text-[11px] font-medium text-dim hover:border-line-strong hover:text-ink"
            >
              {view === 'timeline' ? <Grid2X2 size={14} /> : <List size={14} />}
              {view === 'timeline' ? '宫格' : '时间轴'}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1 rounded-[var(--radius-control)] bg-panel-muted p-1">
            {(
              [
                ['all', '全部'],
                ['source', '上传'],
                ['result', '生成'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'h-8 flex-1 rounded-[8px] text-[11.5px] font-medium transition-colors',
                  filter === key
                    ? 'bg-panel text-ink shadow-[0_1px_4px_rgba(18,27,44,0.10)]'
                    : 'text-faint hover:text-dim',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-[min(62vh,560px)] overflow-y-auto pr-1">
            {visibleAssets.length > 0 ? (
              view === 'timeline' ? (
                <div className="space-y-5">
                  {groups.map(([label, group]) => (
                    <section key={label}>
                      <h3 className="mb-2 text-[11px] font-semibold text-dim">{label}</h3>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {group.map(assetCard)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {visibleAssets.map(assetCard)}
                </div>
              )
            ) : (
              <div className="grid min-h-32 place-items-center rounded-[var(--radius-control)] bg-panel-muted px-5 text-center text-[11.5px] text-faint">
                {filter === 'all'
                  ? '资产库暂无图片，请先上传本地图片'
                  : `暂无${filter === 'source' ? '上传' : '生成'}图片`}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 图片槽位选择器：本地上传与资产选择最终统一返回 assetId。 */
export function AssetPicker({
  label,
  required,
  value,
  onChange,
  compact = false,
  showLabel = true,
  multiple = false,
  values,
  onValuesChange,
  maxItems = MAX_REFERENCE_IMAGES,
  triggerOnly = false,
  triggerLabel = '添加图片',
}: AssetPickerProps) {
  const { assets, currentProjectId, refreshAssets, showToast, openDetail } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [triggerMenuPosition, setTriggerMenuPosition] = useState<
    { left: number; bottom: number } | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const triggerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !triggerMenuRef.current?.contains(target)) {
        setAddMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [addMenuOpen]);

  useEffect(() => {
    if (!triggerOnly || !addMenuOpen) {
      setTriggerMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const rect = triggerButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTriggerMenuPosition({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 6,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [addMenuOpen, triggerOnly]);

  const selectedIds = multiple ? (values ?? []) : value ? [value] : [];
  const atLimit = multiple && selectedIds.length >= maxItems;
  const selectedAssets = selectedIds
    .map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is AssetRow => Boolean(asset));

  const selectAsset = (assetId: string) => {
    setErrorMessage(null);
    if (multiple) {
      if (selectedIds.includes(assetId)) return;
      if (selectedIds.length >= maxItems) {
        setErrorMessage(`最多添加 ${maxItems} 张参考图片`);
        return;
      }
      const next = [...selectedIds, assetId];
      onValuesChange?.(next);
      if (!onValuesChange) onChange(next[0] ?? null);
      return;
    }
    onChange(assetId);
  };

  const removeAsset = (assetId: string) => {
    setErrorMessage(null);
    if (multiple) {
      const next = selectedIds.filter((id) => id !== assetId);
      onValuesChange?.(next);
      if (!onValuesChange) onChange(next[0] ?? null);
      return;
    }
    onChange(null);
  };

  const handleFile = async (file: File) => {
    if (multiple && selectedIds.length >= maxItems) {
      setErrorMessage(`最多添加 ${maxItems} 张参考图片`);
      return;
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      setErrorMessage('仅支持 PNG、JPG、JPEG 或 WebP 图片');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage('图片不能超过 15 MB');
      return;
    }

    const previousIds = [...selectedIds];
    setErrorMessage(null);
    setPendingName(file.name);
    setReplacing(previousIds.length > 0 && !multiple);
    setUploading(true);

    try {
      const { assetId } = await api.upload(file, currentProjectId);
      await refreshAssets();
      if (multiple) {
        const next = [...previousIds, assetId];
        onValuesChange?.(next);
        if (!onValuesChange) onChange(next[0] ?? null);
      } else {
        onChange(assetId);
      }
      showToast(`已上传「${file.name}」并存入资产库`);
      setAddMenuOpen(false);
    } catch (err) {
      const message = `上传失败：${(err as Error).message}`;
      setErrorMessage(message);
      showToast(message);
    } finally {
      setUploading(false);
      setReplacing(false);
      setPendingName(null);
    }
  };

  const openFilePicker = () => fileRef.current?.click();
  const selectedTile = (asset: AssetRow, index: number) => (
    <div
      key={asset.id}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-[var(--radius-image)] border border-line-soft bg-panel',
        compact ? 'h-16 w-16' : 'h-24 w-24',
      )}
    >
      <button
        type="button"
        title="查看大图"
        onClick={() => openDetail(asset)}
        disabled={uploading}
        className="h-full w-full disabled:pointer-events-none"
      >
        <img
          src={asset.url}
          alt={assetTitle(asset)}
          onError={() => {
            setErrorMessage('图片暂不可用，请重新选择');
            removeAsset(asset.id);
          }}
          className="h-full w-full object-contain"
        />
        <span className="absolute inset-0 grid place-items-center bg-ink/0 text-white opacity-0 transition-all group-hover:bg-ink/35 group-hover:opacity-100">
          <Eye size={17} />
        </span>
      </button>
      {multiple && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[5px] bg-ink/70 px-1.5 py-0.5 text-[9px] font-medium leading-tight text-white shadow-sm backdrop-blur-sm">
          图片 {index + 1}
        </span>
      )}
      <button
        type="button"
        aria-label={`移除${assetTitle(asset)}`}
        title="移除图片"
        onClick={() => removeAsset(asset.id)}
        disabled={uploading}
        className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/65 text-white opacity-0 transition-colors hover:bg-err focus-visible:opacity-100 disabled:opacity-50 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
  );

  const addTileButton = (
    <button
      type="button"
      aria-expanded={addMenuOpen}
      aria-label="添加更多图片"
      title={atLimit ? `最多添加 ${maxItems} 张参考图片` : '添加更多图片'}
      disabled={atLimit}
      onClick={() => setAddMenuOpen((open) => !open)}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[var(--radius-image)] border border-dashed border-line bg-panel-muted text-faint transition-colors hover:border-primary hover:text-primary',
        compact ? 'h-16 w-16' : 'h-24 w-24',
        atLimit && 'cursor-not-allowed opacity-45 hover:border-line hover:text-faint',
      )}
    >
      <Plus size={compact ? 24 : 30} strokeWidth={1.5} />
    </button>
  );

  const addImageMenu = (
    <div
      className={cn(
        'pointer-events-none absolute right-0 top-full z-20 mt-2 flex w-[190px] translate-y-1 flex-col gap-0.5 rounded-[var(--radius-control)] border border-line-soft bg-panel p-1.5 opacity-0 shadow-[var(--shadow-floating)] transition-all',
        addMenuOpen && 'pointer-events-auto translate-y-0 opacity-100',
      )}
    >
      <AddImageActions
        assets={assets}
        values={selectedIds}
        onSelect={(assetId) => {
          selectAsset(assetId);
          setAddMenuOpen(false);
        }}
        onUpload={openFilePicker}
        disabled={uploading}
      />
    </div>
  );

  if (triggerOnly) {
    return (
      <div ref={pickerRef} className="relative">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading || atLimit}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <button
          ref={triggerButtonRef}
          type="button"
          aria-expanded={addMenuOpen}
          disabled={uploading || atLimit}
          onClick={() => setAddMenuOpen((open) => !open)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-soft bg-panel px-3 text-[10.5px] font-medium text-dim transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? '上传中…' : triggerLabel}
        </button>
        {addMenuOpen &&
          triggerMenuPosition &&
          createPortal(
            <div
              ref={triggerMenuRef}
              style={{ left: triggerMenuPosition.left, bottom: triggerMenuPosition.bottom }}
              className="fixed z-[100] flex w-[190px] flex-col gap-0.5 rounded-[var(--radius-control)] border border-line-soft bg-panel p-1.5 shadow-[var(--shadow-floating)]"
            >
              <AddImageActions
                assets={assets}
                values={selectedIds}
                onSelect={(assetId) => {
                  selectAsset(assetId);
                  setAddMenuOpen(false);
                }}
                onUpload={openFilePicker}
                disabled={uploading || atLimit}
              />
            </div>,
            document.body,
          )}
        {errorMessage && (
          <div
            role="alert"
            className="mt-2 flex max-w-[280px] items-start gap-1.5 rounded-[var(--radius-control)] bg-err/8 px-2.5 py-2 text-[11px] leading-relaxed text-err"
          >
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={pickerRef}>
      {showLabel && (
        <div className="mb-2 text-[11.5px] font-semibold text-dim">
          {label} {required && <span className="text-primary">*</span>}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {selectedAssets.length > 0 ? (
        <div className="relative flex min-w-0 items-center gap-2 overflow-visible">
          <div className="min-w-0 flex-1">
            <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
              {selectedAssets.map((asset, index) => selectedTile(asset, index))}
            </div>
          </div>
          {uploading ? (
            <div
              className={cn(
                'grid shrink-0 place-items-center rounded-[var(--radius-image)] border border-line bg-panel-muted text-center',
                compact ? 'h-16 w-16' : 'h-24 w-24',
              )}
            >
              <LoaderCircle size={19} className="animate-spin text-primary" />
              <span className="text-[9.5px] text-faint">{replacing ? '替换中…' : '上传中…'}</span>
            </div>
          ) : (
            addTileButton
          )}
          {!uploading && !atLimit && addImageMenu}
        </div>
      ) : uploading ? (
        <div
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-panel-muted px-4',
            compact ? 'h-24' : 'h-28',
          )}
        >
          <LoaderCircle size={20} className="shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <div
              className="truncate text-[12px] font-medium text-ink"
              title={pendingName ?? undefined}
            >
              {pendingName ? compactAssetName(pendingName) : ''}
            </div>
            <div className="mt-0.5 text-[10.5px] text-faint">正在上传并存入资产库…</div>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            if (atLimit) return;
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (atLimit) return;
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (atLimit) {
              setErrorMessage(`最多添加 ${maxItems} 张参考图片`);
              return;
            }
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            'group relative flex items-center justify-center overflow-visible rounded-[var(--radius-control)] border border-dashed px-4 text-center transition-colors',
            compact ? 'h-28' : 'h-32',
            dragActive
              ? 'border-primary bg-primary-soft'
              : compact
                ? 'border-line-soft bg-panel hover:border-line-strong hover:bg-panel-muted'
                : 'border-line bg-panel-muted hover:border-line-strong',
          )}
        >
          <button
            type="button"
            aria-expanded={addMenuOpen}
            aria-label="添加参考图片"
            onClick={() => setAddMenuOpen((open) => !open)}
            className="flex h-full w-full flex-col items-center justify-center text-center"
          >
            <ImagePlus size={19} className={dragActive ? 'text-primary' : 'text-faint'} />
            <div className="mt-1.5 text-[12px] font-medium text-ink">
              {dragActive ? '松开以添加参考图' : '+ 添加参考图'}
            </div>
          </button>
          <div
            className={cn(
              'pointer-events-none absolute left-1/2 top-[calc(50%+20px)] z-20 mt-2 flex w-[190px] -translate-x-1/2 translate-y-1 flex-col gap-0.5 rounded-[var(--radius-control)] border border-line-soft bg-panel p-1.5 opacity-0 shadow-[var(--shadow-floating)] transition-all',
              addMenuOpen && 'pointer-events-auto translate-y-0 opacity-100',
            )}
          >
            <AddImageActions
              assets={assets}
              values={selectedIds}
              onSelect={(assetId) => {
                selectAsset(assetId);
                setAddMenuOpen(false);
              }}
              onUpload={openFilePicker}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-control)] bg-err/8 px-2.5 py-2 text-[11px] leading-relaxed text-err"
        >
          <CircleAlert size={13} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
