import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  // 结果/素材静态托管（M1 本地 Volume；M2a 换对象存储后此路由退役）
  app.use('/files', express.static(resolve(process.env.STORAGE_DIR ?? './storage')));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`[hitframe-api] listening on :${port}`);
}

void bootstrap();
