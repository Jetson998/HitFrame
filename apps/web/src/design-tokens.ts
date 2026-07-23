/**
 * HitFrame 设计令牌 v1.0 (S6-UX)
 * 深色品牌外壳与首页 Hero，浅色高效率创作区，蓝紫品牌色
 */

export const designTokens = {
  colors: {
    // 品牌深色区
    heroBg: '#0B0F19',
    heroSurface: '#141A28',
    heroSurfaceHover: '#1A2233',
    heroText: '#F8FAFC',
    heroTextDim: '#A8B1C3',
    heroLine: 'rgba(255,255,255,0.10)',

    // 浅色工作区
    workspaceBg: '#F4F6FA',
    panel: '#FFFFFF',
    panelMuted: '#F8F9FC',

    // 品牌色
    primary: '#635BFF',
    primaryHover: '#5148E5',
    primarySoft: '#EEEDFF',
    accent: '#3B82F6',
    gradientStart: '#635BFF',
    gradientEnd: '#3B82F6',

    // 文字
    ink: '#111827',
    dim: '#5B6475',
    faint: '#8B95A7',
    disabled: '#B7BFCC',

    // 边框
    line: '#E3E7EF',
    lineSoft: '#EEF1F6',
    lineStrong: '#CBD2DE',

    // 状态
    success: '#16A36A',
    warning: '#D97706',
    error: '#DC3545',
    info: '#2563EB',
  },

  spacing: {
    pageX: 'clamp(20px, 4vw, 48px)',
    heroY: '72px',
    section: '72px',
    sectionTablet: '48px',
    sectionMobile: '36px',
    cardGap: '20px',
    cardGapMobile: '14px',
    contentMax: '1200px',
  },

  radius: {
    button: '10px',
    control: '10px',
    card: '14px',
    image: '12px',
    modal: '16px',
    heroVisual: '18px',
    pill: '999px',
  },

  shadow: {
    card: '0 2px 8px rgba(18, 27, 44, 0.05)',
    cardHover: '0 18px 44px -20px rgba(18, 27, 44, 0.30)',
    floating: '0 12px 36px -16px rgba(18, 27, 44, 0.28)',
    modal: '0 28px 90px -24px rgba(8, 15, 30, 0.45)',
    primary: '0 12px 30px -12px rgba(99, 91, 255, 0.65)',
  },

  typography: {
    heroTitle: {
      desktop: '52px',
      tablet: '42px',
      mobile: '32px',
      weight: 750,
      lineHeight: 1.08,
      letterSpacing: '-0.035em',
    },
    heroSubtitle: {
      size: '17px',
      weight: 400,
      lineHeight: 1.7,
    },
    pageTitle: {
      size: '30px',
      weight: 700,
      lineHeight: 1.25,
    },
    sectionTitle: {
      size: '24px',
      weight: 700,
      lineHeight: 1.35,
    },
    cardTitle: {
      size: '16px',
      weight: 650,
      lineHeight: 1.45,
    },
    body: {
      size: '14px',
      weight: 400,
      lineHeight: 1.65,
    },
    meta: {
      size: '12px',
      weight: 500,
      lineHeight: 1.5,
    },
  },
} as const;

/** 首页文案 */
export const homeCopy = {
  badge: 'AI 商品视觉工作台 · 在线',

  heroTitle: '一张商品图，生成能直接发布的商业视觉',

  heroSubtitle:
    '换背景、真人试穿、营销封面，从上传素材到生成和归档，在一个工作台完成。',

  heroPrimaryCTA: '从商品图开始',
  heroSecondaryCTA: '描述需求给 Agent',

  heroProof: ['2 点起 / 张', '支持 1–4 张候选', '自动保存到资产库'],

  quickStartTitle: '快速开始',
  quickStartSubtitle: '选择一个场景模板，从商品素材直接生成成图',

  recentTitle: '最近创作',
  showcaseTitle: '精选案例',
  showcaseSubtitle: '查看原始素材与生成结果，直接复用同款模板',

  emptyState: {
    noAssets: '还没有作品。从一个模板开始，生成结果会自动保存在这里。',
    noProjects: '创建项目，把同一品牌或活动的素材与成图整理在一起。',
  },

  runState: {
    queued: '任务已提交，正在等待生成',
    running: 'AI 正在生成画面',
    success: '已生成并保存到资产库',
    partial: '部分图片已生成，未完成的任务已退还点数',
    failed: '本次生成未完成，相关点数已退还',
  },
} as const;
