import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';

/** 项目切换器：决定新上传 / 新生成结果的归属（对象键前缀同步生效） */
export function ProjectSwitcher() {
  const { projects, currentProjectId, setCurrentProject, createProject, showToast } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createProject(name.trim());
      setCreating(false);
      setName('');
    } catch (err) {
      showToast(`创建失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 pt-3 pb-1">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-semibold text-dim uppercase tracking-wider">
          项目
        </span>
        <button
          type="button"
          title="新建项目"
          onClick={() => setCreating((v) => !v)}
          className="cursor-pointer rounded-md p-1 text-dim hover:bg-panel-muted hover:text-ink"
        >
          <FolderPlus size={14} />
        </button>
      </div>
      {creating && (
        <div className="mb-2 flex gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="项目名称"
            className="h-8 min-w-0 flex-1 rounded-[--radius-control] border border-line bg-panel-muted px-2.5 text-[12px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
          >
            建
          </Button>
        </div>
      )}
      <select
        value={currentProjectId ?? ''}
        onChange={(e) => setCurrentProject(e.target.value || null)}
        className="w-full cursor-pointer rounded-[--radius-control] border border-line bg-panel-muted px-2.5 py-2 text-[12px] text-ink focus:border-primary focus:outline-none"
      >
        <option value="">未归类</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
