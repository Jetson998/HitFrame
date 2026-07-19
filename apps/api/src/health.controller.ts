import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      code: 0,
      message: 'ok',
      data: { service: 'hitframe-api', version: '0.1.0', time: new Date().toISOString() },
    };
  }
}
