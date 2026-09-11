import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { DbModule } from './db/db.module';
import { ApiTokenGuard } from './auth.guard';
import { StorageService } from './storage/storage.service';
import { StorageReclaimService } from './storage/storage-reclaim.service';
import { CreditsService } from './credits/credits.service';
import { GenerationsService } from './generations/generations.service';
import { ExecutorService } from './generations/executor.service';
import { JobRunnerService } from './generations/job-runner.service';
import { QueueDispatcherService } from './queue/dispatcher.service';
import { GenerationsController } from './generations/generations.controller';
import { RunsController } from './generations/runs.controller';
import { GenerationLogsController } from './generations/generation-logs.controller';
import { GenerationLogsService } from './generations/generation-logs.service';
import { AssetsController } from './assets/assets.controller';
import { TemplatesController } from './templates.controller';
import { MeController } from './me.controller';
import { ProjectsController } from './projects.controller';
import { ShowcaseController } from './showcase.controller';
import { AgentModule } from './agent/agent.module';
import { CreativeModule } from './creative/creative.module';
import { PromptCompilerModule } from './prompt-compiler/prompt-compiler.module';

@Module({
  imports: [DbModule, AgentModule, CreativeModule, PromptCompilerModule],
  controllers: [
    HealthController,
    GenerationsController,
    RunsController,
    GenerationLogsController,
    AssetsController,
    TemplatesController,
    MeController,
    ProjectsController,
    ShowcaseController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiTokenGuard },
    StorageService,
    StorageReclaimService,
    CreditsService,
    GenerationsService,
    JobRunnerService,
    ExecutorService,
    QueueDispatcherService,
    GenerationLogsService,
  ],
})
export class AppModule {}
