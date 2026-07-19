import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { DbModule } from './db/db.module';
import { ApiTokenGuard } from './auth.guard';
import { StorageService } from './storage/storage.service';
import { GenerationsService } from './generations/generations.service';
import { ExecutorService } from './generations/executor.service';
import { GenerationsController } from './generations/generations.controller';
import { RunsController } from './generations/runs.controller';
import { AssetsController } from './assets/assets.controller';
import { TemplatesController } from './templates.controller';
import { MeController } from './me.controller';

@Module({
  imports: [DbModule],
  controllers: [
    HealthController,
    GenerationsController,
    RunsController,
    AssetsController,
    TemplatesController,
    MeController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiTokenGuard },
    StorageService,
    GenerationsService,
    ExecutorService,
  ],
})
export class AppModule {}
