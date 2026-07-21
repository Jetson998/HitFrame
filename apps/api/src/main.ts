import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { filesGateway } from './storage/files.gateway';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  // 结果/素材稳定网关：local 读盘回流 / s3 302→短时效签名直链（过期即刷新）
  app.use('/files', filesGateway());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`[hitframe-api] listening on :${port}`);
}

void bootstrap();
