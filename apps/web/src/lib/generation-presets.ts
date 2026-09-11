import type { GenerationMode } from '@hitframe/shared';
import type { AssetRow } from '@/lib/api';

export interface GenerationPreset {
  label: string;
  assetName: string;
  promptOverride?: string;
  referenceRole?: 'product' | 'person' | 'style';
}

const MODEL_TRY_ON_PROMPT = `以 @图片 1 为核心人物与穿搭参考，严格保留人物的面部特征、发型、肤色、身材比例，以及服装的版型、颜色、材质、纹理、领口、袖型和细节；如添加第二张模特参考图，将其作为身份与体态的补充参考。

按已选的人物风格、动作和场景生成专业电商服装主图。模特姿态自然舒展，表情松弛自信，服装主体完整清晰，穿着关系合理，垂坠、褶皱和受光真实；使用干净克制的商业摄影布光，主体与背景自然融合，肤质自然，人物比例准确，手部完整。

避免改变人物身份或服装设计，避免额外人物、重复肢体、畸形手指、关节扭曲、衣物与身体错误穿插、服装变形、纹理丢失、标识或文字错乱、塑料皮肤、过度磨皮、低清、主体裁切和杂乱背景。`;

const CHARACTER_STYLE_TRANSFER_PROMPT = `以 @图片 1 为唯一角色参考，严格保留人物身份、面部特征、发型、肤色、服装轮廓、配饰和整体姿态，将角色转化为高端街头潮牌广告视觉，采用编辑摄影与精致动漫插画融合风格。

人物保持大胆自信的镜头表现，姿态富有张力，四肢解剖正确，手部结构完整。使用干净的哑光近白色摄影棚背景，加入少量糖果粉、薄荷绿和浅丁香紫的克制涂鸦笔触；右上方硬主光形成清晰阴影，粉色与薄荷色轮廓光勾勒人物，肤色自然，画面层次清楚并保留适度留白。

避免改变人物身份、服装和配饰，避免额外人物、重复肢体、畸形手指、面部错位、错误穿插、塑料皮肤、过度磨皮、背景杂乱、随机文字、水印和低清。`;

export const GENERATION_PRESETS: Record<'i2i' | 't2i', GenerationPreset[]> = {
  i2i: [
    { label: '美妆主图', assetName: 'i2i-1b9a0ba5' },
    { label: '品牌海报重构', assetName: 'i2i-a756efc7' },
    { label: '商业海报', assetName: 'i2i-f754b183' },
    {
      label: '模特穿搭',
      assetName: 'i2i-f52a72ab',
      promptOverride: MODEL_TRY_ON_PROMPT,
      referenceRole: 'person',
    },
  ],
  t2i: [
    { label: '产品概念视觉', assetName: 't2i-eecb1358' },
    { label: '社媒配图', assetName: 't2i-c89ee74c' },
    { label: '时尚人像', assetName: 't2i-c5b4a96d' },
    { label: '角色风格转化', assetName: 't2i-5203c4cf' },
  ],
};

export interface TemplateGenerationPreset {
  assetName: string;
  promptOverride?: string;
  useResultAsReference?: boolean;
  referenceRole?: 'product' | 'person' | 'style';
}

export const TEMPLATE_GENERATION_PRESETS: Record<string, TemplateGenerationPreset> = {
  tpl_poster: { assetName: 'i2i-1b9a0ba5' },
  tpl_model: {
    assetName: 'i2i-f52a72ab',
    promptOverride: MODEL_TRY_ON_PROMPT,
    referenceRole: 'person',
  },
  tpl_bg: {
    assetName: 't2i-5203c4cf',
    promptOverride: CHARACTER_STYLE_TRANSFER_PROMPT,
    useResultAsReference: true,
    referenceRole: 'person',
  },
};

export interface ResolvedGenerationPreset {
  asset: AssetRow;
  mode: GenerationMode;
  prompt: string;
  referenceAssetIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Output settings belong to OutputSettings, not to the reusable prompt. */
export function removePromptOutputSettings(prompt: string): string {
  return prompt
    .replace(
      /完整产品必须处于画面内，\s*(?:正方形\s*)?(?:1:1|3:4|4:3|9:16|16:10)\s*构图。/gu,
      '完整产品必须处于画面内。',
    )
    .replace(/(?:正方形\s*)?(?:1:1|3:4|4:3|9:16|16:10)\s*(?:画幅|构图)[，,。；;]?/gu, '')
    .replace(/^\s*(?:1:1|3:4|4:3|9:16|16:10)\s*(?:横向|竖向)?商业广告[。；;]?\s*$/gmu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolveGenerationPreset(
  assets: AssetRow[],
  assetName: string,
): ResolvedGenerationPreset | null {
  const asset = assets.find((item) => item.type === 'result' && item.name === assetName);
  if (!asset || !isRecord(asset.genParams)) return null;

  const params = asset.genParams;
  const storedPrompt =
    typeof params.userPrompt === 'string'
      ? params.userPrompt
      : typeof params.prompt === 'string'
        ? params.prompt
        : '';
  const mode = params.mode;
  if (!storedPrompt.trim() || (mode !== 'i2i' && mode !== 't2i' && mode !== 'template')) {
    return null;
  }

  const referenceAssetIds = Array.isArray(params.slots)
    ? params.slots.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    asset,
    mode,
    prompt: removePromptOutputSettings(storedPrompt),
    referenceAssetIds,
  };
}
