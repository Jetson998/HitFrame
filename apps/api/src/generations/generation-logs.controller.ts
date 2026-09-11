import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { GenerationLogEvent, GenerationLogsService } from './generation-logs.service';

const EVENTS = new Set<GenerationLogEvent>([
  'accepted',
  'enqueued',
  'enqueue_failed',
  'claimed',
  'provider_started',
  'provider_response',
  'provider_failed',
  'retry',
  'succeeded',
  'failed',
]);

/**
 * 内部排障查询接口。全局 ApiTokenGuard 会保护此路由；暂不接入前端。
 * 只提供分页上限和 Run/Job/Event 过滤，避免一次性拉取整库。
 */
@Controller('internal/generation-logs')
export class GenerationLogsController {
  constructor(private readonly logs: GenerationLogsService) {}

  @Get()
  async list(
    @Query('runId') runId?: string,
    @Query('jobId') jobId?: string,
    @Query('requestId') requestId?: string,
    @Query('relayRequestId') relayRequestId?: string,
    @Query('providerTraceId') providerTraceId?: string,
    @Query('event') event?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) {
      throw new BadRequestException({ code: 400, message: 'limit 必须是正整数' });
    }
    if (event && !EVENTS.has(event as GenerationLogEvent)) {
      throw new BadRequestException({ code: 400, message: 'event 非法' });
    }
    let parsedBefore: Date | undefined;
    if (before) {
      parsedBefore = new Date(before);
      if (Number.isNaN(parsedBefore.getTime())) {
        throw new BadRequestException({ code: 400, message: 'before 必须是 ISO 时间' });
      }
    }

    const data = await this.logs.list({
      runId,
      jobId,
      requestId,
      relayRequestId,
      providerTraceId,
      event: event as GenerationLogEvent | undefined,
      before: parsedBefore,
      limit: parsedLimit,
    });
    return { code: 0, message: 'ok', data };
  }
}
