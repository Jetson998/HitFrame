import { Download, Repeat2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadUrl } from '@/components/ResultPanel';
import { formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store';

/** 资产详情弹窗：参数快照可追溯（genParams），并提供「再次引用」回流入口 */
export function AssetDetailDialog() {
  const { detailAsset: asset, closeDetail, referAsset } = useAppStore();
  if (!asset) return null;

  const gp = (asset.genParams ?? {}) as Record<string, unknown>;
  const rows: Array<[string, string]> = [
    ['类型', asset.type === 'source' ? '上传素材' : '生成结果'],
    ['资产 ID', asset.id],
    ['创建时间', new Date(asset.createdAt).toLocaleString('zh-CN')],
    ['大小', formatBytes(asset.meta?.bytes)],
  ];
  if (asset.type === 'result') {
    if (typeof gp.prompt === 'string') rows.push(['最终 Prompt', gp.prompt]);
    if (typeof gp.size === 'string') rows.push(['请求尺寸', gp.size]);
    if (typeof gp.quality === 'string')
      rows.push(['清晰度', gp.quality === 'high' ? '高清' : '标准']);
    if (asset.sourceJobId) rows.push(['来源 Job', asset.sourceJobId]);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeDetail()}>
      <DialogContent className="grid max-w-[760px] grid-cols-1 md:grid-cols-[380px_1fr]">
        <div className="grid max-h-[70vh] place-items-center bg-[#0c1017]">
          <img src={asset.url} alt={asset.name} className="max-h-[70vh] w-full object-contain" />
        </div>
        <div className="flex flex-col gap-3 p-5">
          <DialogTitle className="pr-6 text-[15px] font-bold">{asset.name}</DialogTitle>
          <DialogDescription className="sr-only">资产详情</DialogDescription>
          <div className="flex flex-col gap-1.5">
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-3 border-b border-line-soft pb-1.5 text-[12px]"
              >
                <span className="shrink-0 text-faint">{k}</span>
                <span className="text-right break-all text-dim">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button onClick={() => downloadUrl(asset.url, `${asset.name}.png`)}>
              <Download size={13} /> 下载
            </Button>
            <Button variant="primary" onClick={() => referAsset(asset.id)}>
              <Repeat2 size={13} /> 引用为参考图
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
