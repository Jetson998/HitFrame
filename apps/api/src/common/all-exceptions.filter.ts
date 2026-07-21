import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * 全局异常兜底（S4 脱敏）：
 * - HttpException：透出其结构化 body（各处已用 {code, message} 干净文案）；
 * - 其它任何异常（DB 错误、供应商原文、未预期抛错）：完整信息**只进服务器日志**，
 *   对外统一返回 `{code: 50000, message: '系统繁忙，请稍后再试'}`——
 *   杜绝堆栈、服务器路径、上游原文、密钥经 500 响应泄漏。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { code: status, message: body } : body);
      return;
    }

    // 非预期异常：全量记日志（含堆栈），对外只回兜底文案
    this.log.error(
      `unhandled exception: ${exception instanceof Error ? exception.stack : String(exception)}`,
    );
    res.status(500).json({ code: 50000, message: '系统繁忙，请稍后再试' });
  }
}
