import { useState } from 'react';
import { setToken } from '@/lib/api';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { ShowcaseWall } from '@/components/ShowcaseWall';

/** M1 最小鉴权：粘贴服务端 API_TOKEN（存 localStorage）；引擎密钥永不到前端 */
export function TokenGate() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setToken(value);
    await bootstrap();
    setBusy(false);
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-bg">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col items-center px-6 py-12">
        <div className="w-[360px] rounded-[--radius-card] border border-line bg-panel p-6 shadow-[0_8px_30px_rgba(23,43,77,0.08)]">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-vio text-[13px] font-extrabold text-white">
              H
            </span>
            <span className="text-[15px] font-bold">HitFrame</span>
          </div>
          <p className="mt-3 mb-4 text-[12.5px] leading-relaxed text-dim">
            输入访问令牌（服务端 <code className="text-faint">.env</code> 中的{' '}
            <code className="text-faint">API_TOKEN</code>）。令牌只保存在本机浏览器。
          </p>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="API Token"
            className="mb-3 w-full rounded-[9px] border border-line bg-panel-muted px-3 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
          />
          <Button
            variant="primary"
            className="w-full"
            disabled={busy || !value.trim()}
            onClick={() => void submit()}
          >
            {busy ? '验证中…' : '进入工作台'}
          </Button>
        </div>

        <div className="mt-12 w-full">
          <ShowcaseWall interactive={false} compact />
        </div>
      </div>
    </div>
  );
}
