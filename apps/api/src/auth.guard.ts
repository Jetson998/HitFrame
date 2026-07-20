import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/** M1 最小访问边界：豁免表外全部要求 Bearer API_TOKEN；引擎密钥只在服务端 */
const PUBLIC_PATHS = new Set(['/api/v1/health', '/api/v1/showcase']);

@Injectable()
export class ApiTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (PUBLIC_PATHS.has(req.path)) return true;
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const expected = process.env.API_TOKEN;
    if (!expected || token !== expected) throw new UnauthorizedException();
    return true;
  }
}
