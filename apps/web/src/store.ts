import { create } from 'zustand';

/** 侧边栏 IA 与 Demo（output/HitFrame_demo.html）保持一致；Agent 在 M1 为禁用占位，M2a 开放 */
export type NavKey = 'home' | 'generate' | 'agent' | 'assets';

interface AppState {
  nav: NavKey;
  setNav: (nav: NavKey) => void;
}

export const useAppStore = create<AppState>((set) => ({
  nav: 'home',
  setNav: (nav) => set({ nav }),
}));
