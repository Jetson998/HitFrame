import { BadRequestException, Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ProjectDto } from '@hitframe/shared';
import { DB, Db } from './db/db.module';
import { projects } from './db/schema';
import { ensureDefaultProject } from './default-project';

const TENANT = 'default'; // M1 单租户

/** 项目：M1 只需列表 + 新建（资产归档、生成结果对象键前缀）；重命名/删除留 M2a */
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async list() {
    await ensureDefaultProject(this.db);
    const rows = await this.db.query.projects.findMany({ orderBy: desc(projects.createdAt) });
    const data: ProjectDto[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
    }));
    return { code: 0, message: 'ok', data };
  }

  @Post()
  async create(@Body() body: { name?: string }) {
    const name = body?.name?.trim();
    if (!name) throw new BadRequestException({ code: 400, message: '项目名称必填' });
    if (name.length > 40)
      throw new BadRequestException({ code: 400, message: '项目名称过长（≤40 字）' });
    const id = `proj_${randomUUID()}`;
    await this.db.insert(projects).values({ id, tenantId: TENANT, name });
    return { code: 0, message: 'ok', data: { id, name } };
  }
}
