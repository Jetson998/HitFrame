import { Module } from '@nestjs/common';
import { PromptCompilerController } from './prompt-compiler.controller';
import { PromptCompilerService } from './prompt-compiler.service';
import { FakeCompilerProvider } from './fake-compiler.provider';
import { compilerFromEnvironment } from './openai-compatible-compiler.provider';
import { PROMPT_COMPILER_PROVIDER } from './prompt-compiler.provider';

@Module({
  controllers: [PromptCompilerController],
  providers: [
    PromptCompilerService,
    FakeCompilerProvider,
    {
      provide: PROMPT_COMPILER_PROVIDER,
      useFactory: () => compilerFromEnvironment(),
    },
  ],
  exports: [PromptCompilerService],
})
export class PromptCompilerModule {}
