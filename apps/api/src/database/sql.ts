import { z } from 'zod';
import type { EntityManager } from 'typeorm';

export type Db = Pick<EntityManager, 'query'>;

export const num = z.union([z.number(), z.string()]).transform((value) => Number(value));
export const id = z.string();
export const text = z.string();
export const flag = z.boolean();
export const when = z.union([z.date(), z.string()]);

export class SqlShapeError extends Error {
  constructor(readonly query: string, readonly issues: z.ZodIssue[]) {
    super(`Unexpected row shape: ${issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`);
  }
}

export async function rows<T extends z.ZodTypeAny>(db: Db, schema: T, query: string, params: unknown[] = []): Promise<Array<z.output<T>>> {
  const result = z.array(schema).safeParse(await db.query(query, params));
  if (!result.success) throw new SqlShapeError(query, result.error.issues);
  return result.data;
}

export async function row<T extends z.ZodTypeAny>(db: Db, schema: T, query: string, params: unknown[] = []): Promise<z.output<T> | undefined> {
  return (await rows(db, schema, query, params))[0];
}

export async function exists(db: Db, query: string, params: unknown[] = []): Promise<boolean> {
  return ((await db.query(query, params)) as unknown[]).length > 0;
}

export async function run(db: Db, query: string, params: unknown[] = []): Promise<void> {
  await db.query(query, params);
}
