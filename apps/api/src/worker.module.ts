import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { StorageService } from './storage/storage.service';
import { CreditsService } from './credits/credits.service';
import { JobRunnerService } from './generations/job-runner.service';

/** Worker 独立进程的最小 DI 容器：无 HTTP、无守卫，只有执行内核依赖 */
@Module({
  imports: [DbModule],
  providers: [StorageService, CreditsService, JobRunnerService],
})
export class WorkerModule {}
