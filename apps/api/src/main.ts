import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`[hitframe-api] listening on :${port}`);
}

void bootstrap();
