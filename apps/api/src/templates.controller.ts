import { Controller, Get, Inject } from '@nestjs/common';
import { TemplateSlotDto, TemplateSummaryDto, TemplateVarDto } from '@hitframe/shared';
import { DB, Db } from './db/db.module';

/** 模板只读列表：卡片与配置页数据化渲染；promptTemplate 不下发前端 */
@Controller('templates')
export class TemplatesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async list() {
    const rows = await this.db.query.nodeTemplates.findMany();
    const data: TemplateSummaryDto[] = rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      sceneType: t.sceneType,
      endpoint: t.endpoint as TemplateSummaryDto['endpoint'],
      slots: t.slots as TemplateSlotDto[],
      varsSchema: t.varsSchema as TemplateVarDto[],
      version: t.version,
    }));
    return { code: 0, message: 'ok', data };
  }
}
