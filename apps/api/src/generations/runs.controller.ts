import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { RunStatusDto } from '@hitframe/shared';
import { DB, Db } from '../db/db.module';
import { assets, generationJobs, generationRuns } from '../db/schema';
import { ORPHAN_TIMEOUT_MS } from './executor.service';
import { JobRunnerService } from './job-runner.service';

@Controller('runs')
export class RunsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly runner: JobRunnerService,
  ) {}

  /** A0 轮询端点；内置孤儿超时判定（running 超时 → failed + refund，S1 起统一走执行器退点路径） */
  @Get(':runId')
  async get(@Param('runId') runId: string) {
    const timedOutJobs = await this.db.query.generationJobs.findMany({
      where: and(
        eq(generationJobs.runId, runId),
        inArray(generationJobs.status, ['running']),
        lt(generationJobs.createdAt, new Date(Date.now() - ORPHAN_TIMEOUT_MS)),
      ),
    });
    if (timedOutJobs.length > 0) {
      for (const job of timedOutJobs) {
        await this.runner.failJobWithRefund(job, 'orphaned: timeout', 'retryable');
      }
      await this.runner.aggregateRun(runId);
    }

    const run = await this.db.query.generationRuns.findFirst({
      where: eq(generationRuns.id, runId),
    });
    if (!run) throw new NotFoundException({ code: 404, message: 'run 不存在' });

    const jobs = await this.db.query.generationJobs.findMany({
      where: eq(generationJobs.runId, runId),
      orderBy: generationJobs.id,
    });
    const jobAssets = await this.db.query.assets.findMany({
      where: inArray(
        assets.sourceJobId,
        jobs.map((j) => j.id),
      ),
    });
    const assetByJob = new Map(jobAssets.map((a) => [a.sourceJobId, a]));

    const data: RunStatusDto = {
      runId: run.id,
      status: run.status as RunStatusDto['status'],
      origin: run.origin as RunStatusDto['origin'],
      candidateCount: run.candidateCount,
      jobs: jobs.map((j) => ({
        jobId: j.id,
        status: j.status as never,
        resultAssetId: assetByJob.get(j.id)?.id,
        resultUrl: j.resultUrl ?? undefined,
        error: j.error ?? undefined,
      })),
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
    };
    return { code: 0, message: 'ok', data };
  }
}
