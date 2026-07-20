import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ShowcaseItemDto } from '@hitframe/shared';
import { DB, Db } from './db/db.module';
import { assets } from './db/schema';

/**
 * 灵感/案例墙（公开端点，免鉴权，见 auth.guard 豁免表）：
 * 未登录页与「已登录未有产出」空态展示；数据 = 打了 meta.showcase 标的生成结果。
 */
@Controller('showcase')
export class ShowcaseController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async list() {
    const rows = await this.db
      .select()
      .from(assets)
      .where(sql`${assets.meta}->>'showcase' = 'true'`)
      .orderBy(sql`(${assets.meta}->>'showcaseOrder')::int NULLS LAST`);
    const data: ShowcaseItemDto[] = rows.map((a) => {
      const meta = (a.meta ?? {}) as { showcaseTitle?: string };
      const gp = (a.genParams ?? {}) as { prompt?: string; mode?: string };
      return {
        id: a.id,
        url: a.url,
        title: meta.showcaseTitle ?? a.name,
        prompt: gp.prompt,
        mode: gp.mode,
      };
    });
    return { code: 0, message: 'ok', data };
  }
}
