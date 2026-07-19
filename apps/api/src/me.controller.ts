import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { MeDto } from '@hitframe/shared';
import { DB, Db } from './db/db.module';
import { tenants } from './db/schema';

const TENANT = 'default'; // M1 单租户

@Controller('me')
export class MeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async me() {
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, TENANT) });
    if (!tenant) throw new NotFoundException({ code: 404, message: 'tenant not initialized' });
    const data: MeDto = {
      tenantId: tenant.id,
      name: tenant.name,
      pointsBalance: tenant.pointsBalance,
    };
    return { code: 0, message: 'ok', data };
  }
}
