import { Body, Controller, Post } from '@nestjs/common';
import { PromptCompileRequestDto } from '@hitframe/shared';
import { PromptCompilerService } from './prompt-compiler.service';

@Controller('prompts')
export class PromptCompilerController {
  constructor(private readonly compiler: PromptCompilerService) {}

  /** Compilation is a preview operation: it never creates a Run, Job or credit hold. */
  @Post('compile')
  async compile(@Body() dto: PromptCompileRequestDto) {
    return { code: 0, message: 'ok', data: await this.compiler.compile(dto) };
  }
}
