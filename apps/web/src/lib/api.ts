import type {
  GenerationAcceptedDto,
  GenerationRequestDto,
  MeDto,
  RunStatusDto,
  TemplateSummaryDto,
} from '@hitframe/shared';

/** 资产行（GET /assets 返回的 DB 行子集；完整类型收敛到阶段 6） */
export interface AssetRow {
  id: string;
  type: 'source' | 'result';
  url: string;
  name: string;
  projectId?: string | null;
  sourceJobId?: string | null;
  genParams?: Record<string, unknown> | null;
  meta?: { storageKey?: string; bytes?: number; mimetype?: string } | null;
  createdAt: string;
}

const TOKEN_KEY = 'hf_api_token';

export function getToken(): string {
  return (
    localStorage.getItem(TOKEN_KEY) ?? (import.meta.env.VITE_API_TOKEN as string | undefined) ?? ''
  );
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok) throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`);
  if (!body) throw new ApiError(res.status, '响应解析失败');
  return body.data;
}

/** 服务端返回的 /files 地址带 PUBLIC_BASE_URL；转相对路径走同源（dev 走 vite 代理，download 属性可用） */
function relUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export const api = {
  me: () => req<MeDto>('/me'),
  templates: () => req<TemplateSummaryDto[]>('/templates'),
  assets: async () => {
    const rows = await req<AssetRow[]>('/assets');
    return rows.map((a) => ({ ...a, url: relUrl(a.url) }));
  },
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return req<{ assetId: string; url: string }>('/assets/uploads', { method: 'POST', body: form });
  },
  createGeneration: (dto: GenerationRequestDto) =>
    req<GenerationAcceptedDto>('/generations', { method: 'POST', body: JSON.stringify(dto) }),
  getRun: async (runId: string) => {
    const run = await req<RunStatusDto>(`/runs/${runId}`);
    return {
      ...run,
      jobs: run.jobs.map((j) => (j.resultUrl ? { ...j, resultUrl: relUrl(j.resultUrl) } : j)),
    };
  },
};
