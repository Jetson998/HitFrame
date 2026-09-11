import { eq } from 'drizzle-orm';
import { DEFAULT_PROJECT_ID } from '@hitframe/shared';
import { projects } from './db/schema';
import type { Db } from './db/db.module';

export const DEFAULT_PROJECT_NAME = '默认项目';

/** 保证单租户的默认归档项目存在，并返回其稳定 ID。 */
export async function ensureDefaultProject(db: Db): Promise<string> {
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, DEFAULT_PROJECT_ID) });
  if (existing) return existing.id;

  await db
    .insert(projects)
    .values({ id: DEFAULT_PROJECT_ID, tenantId: 'default', name: DEFAULT_PROJECT_NAME })
    .onConflictDoNothing({ target: projects.id });
  return DEFAULT_PROJECT_ID;
}
