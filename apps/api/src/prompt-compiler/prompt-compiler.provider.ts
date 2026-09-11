import type {
  CreativeBrief,
  CreationSkill,
  CreativeControls,
  DirectorSuggestions,
  PromptMode,
  ReferenceInput,
} from '@hitframe/shared';

export interface PromptCompilerInput {
  mode: PromptMode;
  generationMode: 't2i' | 'i2i' | 'template';
  rawPrompt: string;
  skill: CreationSkill;
  templateId?: string;
  references: ReferenceInput[];
  controls: CreativeControls;
}

export interface PromptCompilerOutput {
  normalizedBrief: CreativeBrief;
  compiledPrompt: string;
  changeSummary: string[];
  warnings: string[];
  directorSuggestions?: DirectorSuggestions;
}

export interface PromptCompilerProvider {
  readonly name: string;
  readonly model?: string;
  readonly version: string;
  compile(input: PromptCompilerInput): Promise<PromptCompilerOutput>;
}

export const PROMPT_COMPILER_PROVIDER = Symbol('PROMPT_COMPILER_PROVIDER');
