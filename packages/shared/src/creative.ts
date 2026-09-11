import type { GenerationMode, Quality, Ratio } from './index';

/** Prompt interpretation mode. The modes intentionally have different side effects. */
export type PromptMode = 'raw' | 'enhance' | 'director';

export type ReferenceRole = 'product' | 'person' | 'background' | 'style' | 'logo';
export type ReferenceFidelity = 'auto' | 'strict' | 'flexible';

export interface ReferenceInput {
  assetId: string;
  role: ReferenceRole;
  fidelity: ReferenceFidelity;
  slotKey?: string;
  instruction?: string;
}

export type CreationCategory = 'product' | 'content';
export type CreationOutputType = 'image' | 'image_set';
export type TextLayerPolicy = 'overlay_later' | 'no_text';

export interface PromptRuleSet {
  requiredSections: Array<
    'subject' | 'scene' | 'composition' | 'lighting' | 'fidelity' | 'negative'
  >;
  defaultNegativeConstraints: string[];
  textLayerPolicy: TextLayerPolicy;
}

export interface CreationSkill {
  id: string;
  name: string;
  description: string;
  category: CreationCategory;
  outputType: CreationOutputType;
  generationMode: GenerationMode;
  /** 即使该 Skill 的参考图路径有必填角色，也允许用户明确改走纯文字创作。 */
  supportsTextOnly?: boolean;
  requiredReferences: ReferenceRole[];
  optionalReferences: ReferenceRole[];
  defaultRatio: Ratio;
  defaultCandidateCount: number;
  defaultQuality: Quality;
  promptRules: PromptRuleSet;
  /** Provenance is kept with the registry so external skill imports are auditable. */
  source: 'hitframe' | 'opentu-inspired' | 'user';
  license: string;
  version: number;
}

export interface CreativeControls {
  ratio?: Ratio;
  quality?: Quality;
  candidateCount?: number;
  composition?: 'auto' | 'center' | 'left_subject' | 'right_subject' | 'full_bleed';
  shot?: 'auto' | 'close_up' | 'medium' | 'wide';
  lighting?: 'auto' | 'natural' | 'soft' | 'dramatic' | 'studio';
  subjectPreservation?: 'auto' | 'strict' | 'flexible';
  creativity?: 'low' | 'medium' | 'high';
  textStrategy?: 'no_text' | 'safe_area';
  safeArea?: 'none' | 'left' | 'right' | 'top' | 'bottom';
}

export interface DirectorSuggestions {
  concept?: string;
  palette?: string[];
  composition?: string;
  title?: string;
  subtitle?: string;
  sellingPoints?: string[];
}

export interface CreativeBrief {
  intent: string;
  subject: string;
  userFacts: {
    brand?: string;
    productName?: string;
    productFacts: string[];
    sellingPoints: string[];
  };
  scene?: string;
  composition?: string;
  shot?: string;
  lighting?: string;
  visualStyle?: string;
  referenceRoles: ReferenceInput[];
  subjectLocks: string[];
  executionEnhancements: string[];
  negativeConstraints: string[];
  directorSuggestions?: DirectorSuggestions;
  textLayer: {
    brandName?: string;
    title?: string;
    subtitle?: string;
    sellingPoints?: string[];
    renderMode: 'none' | 'overlay_later';
  };
  warnings: string[];
}

export interface PromptCompileRequestDto {
  mode: PromptMode;
  generationMode: GenerationMode;
  rawPrompt: string;
  skillId?: string;
  templateId?: string;
  references?: ReferenceInput[];
  controls?: CreativeControls;
}

export interface PromptCompileResponseDto {
  compileId: string;
  mode: PromptMode;
  compilerVersion: string;
  rawPrompt: string;
  normalizedBrief: CreativeBrief;
  compiledPrompt: string;
  changeSummary: string[];
  warnings: string[];
  directorSuggestions?: DirectorSuggestions;
  requiresConfirmation: boolean;
  requestHash: string;
}

/** Public skill list item; internal prompt rules are intentionally omitted. */
export interface CreationSkillSummaryDto {
  id: string;
  name: string;
  description: string;
  category: CreationCategory;
  outputType: CreationOutputType;
  generationMode: GenerationMode;
  requiredReferences: ReferenceRole[];
  optionalReferences: ReferenceRole[];
  defaultRatio: Ratio;
  defaultCandidateCount: number;
  defaultQuality: Quality;
  textLayerPolicy: TextLayerPolicy;
  version: number;
}
