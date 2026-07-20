import { create } from 'zustand';
import type { ProjectDto, ShowcaseItemDto, TemplateSummaryDto } from '@hitframe/shared';
import { api, ApiError, type AssetRow } from './lib/api';

/** 侧边栏 IA 与 Demo（output/HitFrame_demo.html）保持一致；Agent 在 M1 为禁用占位，M2a 开放 */
export type NavKey = 'home' | 'generate' | 'agent' | 'assets';
export type GenMode = 'i2i' | 't2i' | 'template';
export type AuthState = 'checking' | 'ok' | 'unauthorized';

interface AppState {
  nav: NavKey;
  setNav: (nav: NavKey) => void;

  auth: AuthState;
  bootstrap: () => Promise<void>;

  genMode: GenMode;
  setGenMode: (mode: GenMode) => void;
  /** 打开中的模板配置页（genMode=template 时生效） */
  activeTplId: string | null;
  setActiveTplId: (id: string | null) => void;
  /** i2i 参考图槽位（「再次引用」写入此处并跳转） */
  refAssetId: string | null;
  setRefAssetId: (id: string | null) => void;
  referAsset: (assetId: string) => void;

  balance: number | null;
  assets: AssetRow[];
  templates: TemplateSummaryDto[];
  projects: ProjectDto[];
  /** 当前项目：新上传/新生成的归属；null = 未归类 */
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;
  createProject: (name: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshAssets: () => Promise<void>;
  refreshProjects: () => Promise<void>;

  detailAsset: AssetRow | null;
  openDetail: (asset: AssetRow) => void;
  openDetailById: (assetId: string) => Promise<void>;
  closeDetail: () => void;

  /** 灵感/案例墙（公开数据，未登录也加载） */
  showcase: ShowcaseItemDto[];
  loadShowcase: () => Promise<void>;
  /** 「用这个提示词」：跳文生图并回填（GeneratePage 消费后清空） */
  pendingPrompt: string | null;
  tryPrompt: (prompt: string) => void;
  consumePendingPrompt: () => string | null;

  toast: string | null;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  nav: 'home',
  setNav: (nav) => set({ nav }),

  auth: 'checking',
  bootstrap: async () => {
    try {
      const me = await api.me();
      const [templates, assets, projects] = await Promise.all([
        api.templates(),
        api.assets(),
        api.projects(),
      ]);
      set({ auth: 'ok', balance: me.pointsBalance, templates, assets, projects });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) set({ auth: 'unauthorized' });
      else {
        set({ auth: 'ok' });
        get().showToast(`加载失败：${(err as Error).message}`);
      }
    }
  },

  genMode: 'i2i',
  setGenMode: (genMode) => set({ genMode }),
  activeTplId: null,
  setActiveTplId: (activeTplId) => set({ activeTplId }),
  refAssetId: null,
  setRefAssetId: (refAssetId) => set({ refAssetId }),
  referAsset: (assetId) =>
    set({
      refAssetId: assetId,
      genMode: 'i2i',
      activeTplId: null,
      nav: 'generate',
      detailAsset: null,
    }),

  balance: null,
  assets: [],
  templates: [],
  projects: [],
  currentProjectId: null,
  setCurrentProject: (currentProjectId) => set({ currentProjectId }),
  createProject: async (name) => {
    const { id } = await api.createProject(name);
    await get().refreshProjects();
    set({ currentProjectId: id });
    get().showToast(`已创建项目「${name}」并切换`);
  },
  refreshMe: async () => {
    try {
      const me = await api.me();
      set({ balance: me.pointsBalance });
    } catch {
      /* 余额刷新失败不打断主流程 */
    }
  },
  refreshAssets: async () => {
    try {
      set({ assets: await api.assets() });
    } catch {
      /* 列表刷新失败不打断主流程 */
    }
  },
  refreshProjects: async () => {
    try {
      set({ projects: await api.projects() });
    } catch {
      /* 列表刷新失败不打断主流程 */
    }
  },

  detailAsset: null,
  openDetail: (detailAsset) => set({ detailAsset }),
  openDetailById: async (assetId) => {
    let asset = get().assets.find((a) => a.id === assetId);
    if (!asset) {
      await get().refreshAssets();
      asset = get().assets.find((a) => a.id === assetId);
    }
    if (asset) set({ detailAsset: asset });
  },
  closeDetail: () => set({ detailAsset: null }),

  showcase: [],
  loadShowcase: async () => {
    try {
      set({ showcase: await api.showcase() });
    } catch {
      /* 案例墙加载失败静默（不阻断主流程） */
    }
  },
  pendingPrompt: null,
  tryPrompt: (prompt) =>
    set({ pendingPrompt: prompt, genMode: 't2i', activeTplId: null, nav: 'generate' }),
  consumePendingPrompt: () => {
    const p = get().pendingPrompt;
    if (p) set({ pendingPrompt: null });
    return p;
  },

  toast: null,
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));
