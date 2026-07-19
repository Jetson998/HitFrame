import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB, Db } from '../db/db.module';
import { assets } from '../db/schema';
import { StorageService } from '../storage/storage.service';

const TENANT = 'default';
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

/** M1 最小资产接口：上传素材（供 i2i/模板槽位引用）+ 列表；完整资产库为阶段 6 */
@Controller('assets')
export class AssetsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 400, message: '缺少文件字段 file' });
    const ext = ALLOWED.get(file.mimetype);
    if (!ext) throw new BadRequestException({ code: 400, message: `不支持的类型：${file.mimetype}` });

    const assetId = `asset_${randomUUID()}`;
    const key = `uploads/${assetId}.${ext}`;
    const stored = await this.storage.save(key, file.buffer);
    await this.db.insert(assets).values({
      id: assetId,
      tenantId: TENANT,
      type: 'source',
      url: stored.url,
      name: file.originalname || assetId,
      meta: { storageKey: key, bytes: file.size, mimetype: file.mimetype },
    });
    return { code: 0, message: 'ok', data: { assetId, url: stored.url } };
  }

  @Get()
  async list() {
    const rows = await this.db.query.assets.findMany({
      orderBy: desc(assets.createdAt),
      limit: 100,
    });
    return { code: 0, message: 'ok', data: rows };
  }
}
