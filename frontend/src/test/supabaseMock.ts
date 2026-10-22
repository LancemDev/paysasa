/** Minimal chainable stand-in for supabase.from(...) reads used by fetchers. Tests set `tables`. */
export const tables: Record<string, unknown[]> = {};

function query(table: string) {
  let rows = () => tables[table] ?? [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: (col: string, val: unknown) => {
      const prev = rows;
      rows = () => prev().filter((r) => (r as Record<string, unknown>)[col] === val);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return chain;
}

export const supabaseMock = {
  from: (table: string) => query(table),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => undefined,
};
