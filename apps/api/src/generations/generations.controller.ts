import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { GenerationAcceptedDto, GenerationRequestDto } from '@hitframe/shared';
import { GenerationsService } from './generations.service';

@Controller('generations')
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  /** A0：三种输入结构共用一条管线；origin 由服务端写入（M1: quick|template） */
  @Post()
  @HttpCode(202)
  async create(@Body() dto: GenerationRequestDto) {
    const origin = dto.mode === 'template' ? 'template' : 'quick';
    const data: GenerationAcceptedDto = await this.generations.create(dto, origin);
    return { code: 0, message: 'accepted', data };
  }
}
