import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { DbModule } from './db/db.module';
import { ApiTokenGuard } from './auth.guard';
import { StorageService } from './storage/storage.service';
import { CreditsService } from './credits/credits.service';
import { GenerationsService } from './generations/generations.service';
import { ExecutorService } from './generations/executor.service';
import { GenerationsController } from './generations/generations.controller';
import { RunsController } from './generations/runs.controller';
import { AssetsController } from './assets/assets.controller';
import { TemplatesController } from './templates.controller';
import { MeController } from './me.controller';
import { ProjectsController } from './projects.controller';
import { ShowcaseController } from './showcase.controller';

@Module({
  imports: [DbModule],
  controllers: [
    HealthController,
    GenerationsController,
    RunsController,
    AssetsController,
    TemplatesController,
    MeController,
    ProjectsController,
    ShowcaseController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiTokenGuard },
    StorageService,
    CreditsService,
    GenerationsService,
    ExecutorService,
  ],
})
export class AppModule {}
