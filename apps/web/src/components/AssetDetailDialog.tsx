import { useState } from 'react';
import { Download, Repeat2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadUrl } from '@/components/ResultPanel';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store';

/** 资产详情弹窗：参数快照可追溯（genParams）、改归属、删除、「再次引用」回流入口 */
export function AssetDetailDialog() {
  const {
    detailAsset: asset,
    closeDetail,
    referAsset,
    projects,
    refreshAssets,
    showToast,
  } = useAppStore();
  const [busy, setBusy] = useState(false);
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

  const reassign = async (projectId: string | null) => {
    setBusy(true);
    try {
      await api.updateAsset(asset.id, { projectId });
      await refreshAssets();
      useAppStore.setState({ detailAsset: { ...asset, projectId } });
      showToast(
        projectId
          ? `已归入「${projects.find((p) => p.id === projectId)?.name ?? projectId}」`
          : '已移回未归类',
      );
    } catch (err) {
      showToast(`改归属失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`确认删除「${asset.name}」？文件将一并删除，不可恢复。`)) return;
    setBusy(true);
    try {
      await api.deleteAsset(asset.id);
      await refreshAssets();
      closeDetail();
      showToast('已删除');
    } catch (err) {
      showToast(`删除失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && closeDetail()}>
      <DialogContent className="grid max-w-[760px] grid-cols-1 md:grid-cols-[380px_1fr]">
        <div className="grid max-h-[70vh] place-items-center bg-stage">
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
          <div>
            <div className="mb-1.5 text-[11.5px] text-faint">归属项目</div>
            <select
              value={asset.projectId ?? ''}
              disabled={busy}
              onChange={(e) => void reassign(e.target.value || null)}
              className="w-full cursor-pointer rounded-[9px] border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="">未归类</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button onClick={() => downloadUrl(asset.url, `${asset.name}.png`)}>
              <Download size={13} /> 下载
            </Button>
            <Button variant="primary" onClick={() => referAsset(asset.id)}>
              <Repeat2 size={13} /> 引用为参考图
            </Button>
            <Button
              disabled={busy}
              className="ml-auto border-err/40 text-err hover:bg-err/10"
              onClick={() => void remove()}
            >
              <Trash2 size={13} /> 删除
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
