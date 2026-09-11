import { Injectable } from '@nestjs/common';
import type { PromptCompilerProvider } from './prompt-compiler.provider';
import type { PromptCompilerInput, PromptCompilerOutput } from './prompt-compiler.provider';
import { buildFakeOutput } from './prompt-compiler.utils';

@Injectable()
export class FakeCompilerProvider implements PromptCompilerProvider {
  readonly name = 'fake';
  readonly model = 'fake-prompt-compiler-1';
  readonly version = 's6c2-fake-v2';

  async compile(input: PromptCompilerInput): Promise<PromptCompilerOutput> {
    return buildFakeOutput(input);
  }
}
