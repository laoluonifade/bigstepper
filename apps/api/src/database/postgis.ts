type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

let known: Promise<boolean> | null = null;

export function hasPostgis(db: Queryable): Promise<boolean> {
  known ??= db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'route') AS "ok"`)
    .then((rows) => Boolean((rows as Array<{ ok: boolean }>)[0]?.ok))
    .catch(() => { known = null; return false; });
  return known;
}

export const ROUTE_TOLERANCE_DEGREES = 0.00001;
