import { useEffect, useRef, useState } from 'react';
import type { RunStatusDto } from '@hitframe/shared';
import { api } from '@/lib/api';

const POLL_MS = 2500;
const TERMINAL: RunStatusDto['status'][] = ['succeeded', 'failed', 'partial'];

/**
 * A0 协议异步：POST 拿到 runId 后轮询 GET /runs/{runId} 直到终态。
 * onFinished 用于刷新余额与资产列表。
 */
export function useRunPolling(onFinished?: (run: RunStatusDto) => void) {
  const [run, setRun] = useState<RunStatusDto | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const start = (runId: string) => {
    stop();
    setRun(null);
    const tick = async () => {
      try {
        const r = await api.getRun(runId);
        setRun(r);
        if (TERMINAL.includes(r.status)) {
          stop();
          finishedRef.current?.(r);
        }
      } catch {
        /* 单次轮询失败忽略，下一轮重试 */
      }
    };
    void tick();
    timer.current = setInterval(() => void tick(), POLL_MS);
  };

  const reset = () => {
    stop();
    setRun(null);
  };

  useEffect(() => stop, []);
  return { run, start, reset };
}
