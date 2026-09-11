import type {
  AgentPlanDto,
  AgentRouteRequestDto,
  CreationSkillSummaryDto,
  GenerationAcceptedDto,
  GenerationRequestDto,
  MeDto,
  ProjectDto,
  RunStatusDto,
  ShowcaseItemDto,
  TemplateSummaryDto,
  PromptCompileRequestDto,
  PromptCompileResponseDto,
  RunOrigin,
} from '@hitframe/shared';

export type AgentPlan = AgentPlanDto;

/** 资产行（GET /assets 返回的 DB 行子集；完整类型收敛到阶段 6） */
export interface AssetRow {
  id: string;
  type: 'source' | 'result';
  url: string;
  name: string;
  projectId?: string | null;
  sourceJobId?: string | null;
  genParams?: Record<string, unknown> | null;
  meta?: { storageKey?: string; bytes?: number; mimetype?: string; favorite?: boolean } | null;
  createdAt: string;
}

/** 资产名称用于紧凑型图片卡片：最多展示 8 个字符（含省略号）。 */
export function compactAssetName(value: string, maxLength = 8): string {
  const name = value.trim();
  const chars = Array.from(name);
  if (chars.length <= maxLength) return name;
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…`;
}

const TOKEN_KEY = 'hf_api_token';

/**
 * 运行时配置（R10 修复）：不再用 `import.meta.env.VITE_API_TOKEN`——那会在构建期
 * 被 Vite 静态内联进 JS 产物，任何配了 token 的构建都会把令牌打进包里泄漏。
 * 改从运行时全局 `window.__HF_CONFIG__` 读取（由部署时生成的 /config.js 注入，
 * 独立于主包，可按环境替换、不重新构建）。缺省为空，用户仍以 TokenGate 粘贴为主。
 */
declare global {
  interface Window {
    __HF_CONFIG__?: { apiToken?: string };
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? window.__HF_CONFIG__?.apiToken ?? '';
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
  creationSkills: () => req<CreationSkillSummaryDto[]>('/creation-skills'),
  assets: async () => {
    const rows = await req<AssetRow[]>('/assets');
    return rows.map((a) => ({ ...a, url: relUrl(a.url) }));
  },
  upload: (file: File, projectId?: string | null) => {
    const form = new FormData();
    form.append('file', file);
    if (projectId) form.append('projectId', projectId);
    return req<{ assetId: string; url: string }>('/assets/uploads', { method: 'POST', body: form });
  },
  updateAsset: (id: string, patch: { projectId?: string | null; favorite?: boolean }) =>
    req<{ id: string }>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAsset: (id: string) => req<{ id: string }>(`/assets/${id}`, { method: 'DELETE' }),
  projects: () => req<ProjectDto[]>('/projects'),
  /** 公开端点：未登录也可访问（灵感/案例墙） */
  showcase: async () => {
    const rows = await req<ShowcaseItemDto[]>('/showcase');
    return rows.map((s) => ({ ...s, url: relUrl(s.url) }));
  },
  createProject: (name: string) =>
    req<{ id: string; name: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  createGeneration: (dto: GenerationRequestDto, origin?: RunOrigin) =>
    req<GenerationAcceptedDto>('/generations', {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: origin ? { 'x-hitframe-origin': origin } : undefined,
    }),
  /** Agent 规则路由（S5.4）：无副作用，只返回方案卡；用户确认后再调 createGeneration */
  agentRoute: (
    userInput: string,
    references?: NonNullable<AgentRouteRequestDto['references']>,
    skillId?: string,
    referencePreference?: AgentRouteRequestDto['referencePreference'],
  ) =>
    req<AgentPlan>('/agent/route', {
      method: 'POST',
      body: JSON.stringify({
        userInput,
        references,
        uploadedImages: references?.map((reference) => reference.assetId),
        skillId,
        referencePreference,
      } satisfies AgentRouteRequestDto),
    }),
  compilePrompt: (dto: PromptCompileRequestDto) =>
    req<PromptCompileResponseDto>('/prompts/compile', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  getRun: async (runId: string) => {
    const run = await req<RunStatusDto>(`/runs/${runId}`);
    return {
      ...run,
      jobs: run.jobs.map((j) => (j.resultUrl ? { ...j, resultUrl: relUrl(j.resultUrl) } : j)),
    };
  },
};
