import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB, Db } from '../db/db.module';
import { assets, projects } from '../db/schema';
import { StorageService } from '../storage/storage.service';

const TENANT = 'default';
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

/** 资产接口（阶段 6）：上传（可带项目归属）/ 列表过滤 / 改归属 / 删除（含存储文件清理） */
@Controller('assets')
export class AssetsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(@UploadedFile() file?: Express.Multer.File, @Body('projectId') projectId?: string) {
    if (!file) throw new BadRequestException({ code: 400, message: '缺少文件字段 file' });
    const ext = ALLOWED.get(file.mimetype);
    if (!ext)
      throw new BadRequestException({ code: 400, message: `不支持的类型：${file.mimetype}` });
    if (projectId) await this.assertProject(projectId);

    const assetId = `asset_${randomUUID()}`;
    const key = `uploads/${assetId}.${ext}`;
    const stored = await this.storage.save(key, file.buffer);
    await this.db.insert(assets).values({
      id: assetId,
      tenantId: TENANT,
      projectId: projectId || null,
      type: 'source',
      url: stored.url,
      name: file.originalname || assetId,
      meta: { storageKey: key, bytes: file.size, mimetype: file.mimetype },
    });
    return { code: 0, message: 'ok', data: { assetId, url: stored.url } };
  }

  /** projectId=none 表示筛「未归档」；不传表示全部 */
  @Get()
  async list(@Query('projectId') projectId?: string, @Query('type') type?: string) {
    const where: SQL[] = [];
    if (projectId === 'none') where.push(isNull(assets.projectId));
    else if (projectId) where.push(eq(assets.projectId, projectId));
    if (type === 'source' || type === 'result') where.push(eq(assets.type, type));

    const rows = await this.db.query.assets.findMany({
      where: where.length ? and(...where) : undefined,
      orderBy: desc(assets.createdAt),
      limit: 200,
    });
    return { code: 0, message: 'ok', data: rows };
  }

  /** 改归属：projectId 传 null 即移回「未归档」 */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { projectId?: string | null }) {
    const asset = await this.db.query.assets.findFirst({ where: eq(assets.id, id) });
    if (!asset) throw new NotFoundException({ code: 404, message: '资产不存在' });
    if (!('projectId' in body))
      throw new BadRequestException({ code: 400, message: '无可更新字段' });
    const projectId = body.projectId || null;
    if (projectId) await this.assertProject(projectId);
    await this.db.update(assets).set({ projectId }).where(eq(assets.id, id));
    return { code: 0, message: 'ok', data: { id, projectId } };
  }

  /**
   * 删除：资产行 + 存储文件（best-effort）。
   * 历史 Run/Job/UsageEvent 记录保留（参数快照仍可追溯），其 resultUrl 将 404。
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const asset = await this.db.query.assets.findFirst({ where: eq(assets.id, id) });
    if (!asset) throw new NotFoundException({ code: 404, message: '资产不存在' });

    const key = (asset.meta as { storageKey?: string } | null)?.storageKey;
    if (key) {
      try {
        await this.storage.delete(key);
      } catch {
        /* 文件清理失败不阻塞删除（可由后续巡检回收） */
      }
    }
    await this.db.delete(assets).where(eq(assets.id, id));
    return { code: 0, message: 'ok', data: { id } };
  }

  private async assertProject(projectId: string): Promise<void> {
    const p = await this.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!p) throw new BadRequestException({ code: 400, message: `项目不存在：${projectId}` });
  }
}
