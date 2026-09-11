import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { GenerationAcceptedDto, GenerationRequestDto, RunOrigin } from '@hitframe/shared';
import { GenerationsService, GenerationRequestContext } from './generations.service';

@Controller('generations')
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  /** A0：三种输入结构共用一条管线；入口来源只接受受控值，用于可观测性。 */
  @Post()
  @HttpCode(202)
  async create(@Body() dto: GenerationRequestDto, @Req() req: Request) {
    const requestedOrigin = req.header('x-hitframe-origin');
    const origin: RunOrigin =
      requestedOrigin === 'agent' ? 'agent' : dto.mode === 'template' ? 'template' : 'quick';
    const context: GenerationRequestContext = {
      requestId: req.header('x-request-id') ?? `req_${randomUUID()}`,
      requestIp: req.ip,
    };
    const data: GenerationAcceptedDto = await this.generations.create(dto, origin, context);
    return { code: 0, message: 'accepted', data };
  }
}
