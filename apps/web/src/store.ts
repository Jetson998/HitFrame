import { create } from 'zustand';
import type { TemplateSummaryDto } from '@hitframe/shared';
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
  refreshMe: () => Promise<void>;
  refreshAssets: () => Promise<void>;

  detailAsset: AssetRow | null;
  openDetail: (asset: AssetRow) => void;
  openDetailById: (assetId: string) => Promise<void>;
  closeDetail: () => void;

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
      const [templates, assets] = await Promise.all([api.templates(), api.assets()]);
      set({ auth: 'ok', balance: me.pointsBalance, templates, assets });
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

  toast: null,
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));
