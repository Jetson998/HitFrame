import { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compactAssetName } from '@/lib/api';

export const REMOVED_IMAGE_REFERENCE = '[已移除图片]';

export interface ReferencePromptImage {
  assetId: string;
  name: string;
  url?: string;
}

interface ReferencePromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  images: ReferencePromptImage[];
  /** 最近资产列表；未选入槽位的图片也可以从 @ 菜单直接加入。 */
  availableImages?: ReferencePromptImage[];
  /** 返回 false 时不插入引用（例如已达到最多参考图数量）。 */
  onReferenceSelect?: (assetId: string) => boolean | void;
  maxImages?: number;
  className?: string;
  placeholder?: string;
  textareaClassName?: string;
  highlightClassName?: string;
}

interface MentionRange {
  start: number;
  end: number;
}

const IMAGE_REFERENCE_PATTERN = /@(?:图片|圖片)\s*(\d+)/g;

export function remapImageReferences(
  prompt: string,
  previousAssetIds: string[],
  nextAssetIds: string[],
): string {
  return prompt.replace(IMAGE_REFERENCE_PATTERN, (reference, rawImageNumber: string) => {
    const previousIndex = Number(rawImageNumber) - 1;
    const assetId = previousAssetIds[previousIndex];
    if (!assetId) return reference;
    const nextIndex = nextAssetIds.indexOf(assetId);
    return nextIndex < 0 ? REMOVED_IMAGE_REFERENCE : `@图片 ${nextIndex + 1}`;
  });
}

function activeMentionRange(value: string, cursor: number): MentionRange | null {
  const beforeCursor = value.slice(0, cursor);
  const match = /@[^@\n，。！？,.;；：:]{0,12}$/.exec(beforeCursor);
  if (!match) return null;
  return { start: match.index, end: cursor };
}

export function ReferencePromptEditor({
  value,
  onChange,
  images,
  availableImages = [],
  onReferenceSelect,
  maxImages,
  className,
  placeholder = '描述你的生图需求，输入 @ 指定图片',
  textareaClassName,
  highlightClassName,
}: ReferencePromptEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);

  const selectableImages = useMemo(() => {
    const merged = [...images, ...availableImages];
    const seen = new Set<string>();
    return merged.filter((image) => {
      if (seen.has(image.assetId)) return false;
      seen.add(image.assetId);
      return true;
    });
  }, [availableImages, images]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [menuOpen]);

  // 内容变长时自动展开；达到上限后保留内部滚动，同时允许用户通过右下角手动调整高度。
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const openReferenceMenu = () => {
    if (selectableImages.length === 0) return;
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    setMentionRange({ start: cursor, end: cursor });
    setMenuOpen(true);
    textareaRef.current?.focus();
  };

  const insertReference = (imageIndex: number) => {
    const textarea = textareaRef.current;
    const fallbackCursor = textarea?.selectionStart ?? value.length;
    const range = mentionRange ?? {
      start: fallbackCursor,
      end: textarea?.selectionEnd ?? fallbackCursor,
    };
    const token = `@图片 ${imageIndex + 1}`;
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const leadingSpace = before && !/[\s（([，。！？:：]$/.test(before) ? ' ' : '';
    const trailingSpace = after && !/^[\s，。！？,.;；:：）)\]]/.test(after) ? ' ' : '';
    const nextValue = `${before}${leadingSpace}${token}${trailingSpace}${after}`;
    const nextCursor = before.length + leadingSpace.length + token.length + trailingSpace.length;
    onChange(nextValue);
    setMenuOpen(false);
    setMentionRange(null);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleReferenceSelect = (assetId: string) => {
    const selectedIndex = images.findIndex((image) => image.assetId === assetId);
    const isSelected = selectedIndex >= 0;
    if (!isSelected && maxImages !== undefined && images.length >= maxImages) return;
    const nextIndex = isSelected ? selectedIndex : images.length;
    if (!isSelected && onReferenceSelect?.(assetId) === false) return;
    insertReference(nextIndex);
  };

  const highlightedPrompt = useMemo(() => {
    const nodes: Array<{ text: string; reference: boolean }> = [];
    let lastIndex = 0;
    const displayPattern = /@(?:图片|圖片)?(?:\s*\d+)?/g;
    for (const match of value.matchAll(displayPattern)) {
      const index = match.index ?? 0;
      if (index > lastIndex) nodes.push({ text: value.slice(lastIndex, index), reference: false });
      nodes.push({ text: match[0], reference: true });
      lastIndex = index + match[0].length;
    }
    if (lastIndex < value.length) nodes.push({ text: value.slice(lastIndex), reference: false });
    return nodes;
  }, [value]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        ref={highlightRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-0 pb-7 text-[13px] leading-relaxed',
          highlightClassName,
        )}
      >
        {highlightedPrompt.map((node, index) => (
          <span
            key={`${index}-${node.text}`}
            className={node.reference ? 'font-medium text-primary' : 'text-ink'}
          >
            {node.text}
          </span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const range = activeMentionRange(nextValue, event.target.selectionStart);
          onChange(nextValue);
          setMentionRange(range);
          setMenuOpen(Boolean(range) && selectableImages.length > 0);
        }}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMenuOpen(false);
        }}
        placeholder={placeholder}
        aria-label="描述你的生图需求"
        className={cn(
          'relative z-10 min-h-[124px] max-h-[420px] w-full resize-y overflow-y-auto border-0 bg-transparent p-0 pb-7 text-[13px] leading-relaxed text-transparent caret-primary placeholder:text-faint focus:outline-none selection:bg-primary/15 selection:text-transparent',
          textareaClassName,
        )}
      />

      <button
        type="button"
        disabled={selectableImages.length === 0}
        onClick={openReferenceMenu}
        className="absolute bottom-0 left-0 inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-medium text-faint transition-colors hover:bg-panel-muted hover:text-primary disabled:pointer-events-none disabled:opacity-45"
      >
        <AtSign size={12} /> 引用图片
      </button>

      <div
        role="listbox"
        aria-label="选择要引用的图片"
        className={cn(
          'absolute left-0 top-full z-30 mt-2 w-[230px] rounded-[var(--radius-control)] border border-line-soft bg-panel p-1.5 shadow-[var(--shadow-floating)]',
          menuOpen ? 'block' : 'hidden',
        )}
      >
        {selectableImages.length > 0 && (
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-faint">最近图片</div>
        )}
        {selectableImages.map((image) => {
          const selectedIndex = images.findIndex((selected) => selected.assetId === image.assetId);
          const isSelected = selectedIndex >= 0;
          const disabled = !isSelected && maxImages !== undefined && images.length >= maxImages;
          return (
            <button
              key={image.assetId}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => handleReferenceSelect(image.assetId)}
              className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-[7px] px-2 text-left transition-colors hover:bg-panel-muted disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-panel-muted text-faint">
                {image.url ? (
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-medium text-ink">
                  {isSelected ? `图片 ${selectedIndex + 1}` : `添加为图片 ${images.length + 1}`}
                </span>
                <span className="block truncate text-[10px] text-faint" title={image.name}>
                  {compactAssetName(image.name)}
                </span>
              </span>
              <AtSign size={13} className="shrink-0 text-faint" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
