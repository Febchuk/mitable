import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
/** Small stateful DB boundary for exercising the actual report route handlers. */
export function reportMemoryDb(tables: Record<string, Row[]>) {
  const failures = new Map<string, string>();
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<{ key: string; ascending: boolean }> = [];
    let maximum = Infinity;
    let start = 0;
    let operation = "select";
    let payload: Row | Row[] = {};
    let conflictKeys: string[] = [];
    const value = (row: Row, key: string): unknown =>
      key.split(".").reduce<unknown>((current, part) => (current as Row | null)?.[part], row);
    const execute = () => {
      if (failures.has(table)) return { data: null, error: { message: failures.get(table)! } };
      const rows = (tables[table] ??= []);
      let upserted: Row[] | undefined;
      if (operation === "insert") {
        upserted = (Array.isArray(payload) ? payload : [payload]).map((item) => ({
          id: crypto.randomUUID(),
          ...item,
        }));
        rows.push(...upserted);
      }
      if (operation === "upsert") {
        upserted = [];
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const existing = rows.find((row) => conflictKeys.every((key) => row[key] === item[key]));
          if (existing) {
            Object.assign(existing, item);
            upserted.push(existing);
          } else {
            const inserted = { id: crypto.randomUUID(), ...item };
            rows.push(inserted);
            upserted.push(inserted);
          }
        }
      }
      let data = (upserted ?? rows).filter((row) => filters.every((filter) => filter(row)));
      if (operation === "update") data.forEach((row) => Object.assign(row, payload));
      if (operation === "delete") {
        const removed = new Set(data);
        tables[table] = rows.filter((row) => !removed.has(row));
      }
      for (const { key, ascending } of [...orders].reverse())
        data = [...data].sort(
          (a, b) =>
            String(value(a, key) ?? "").localeCompare(String(value(b, key) ?? "")) *
            (ascending ? 1 : -1)
        );
      return { data: data.slice(start, start + maximum), error: null };
    };
    const q = {
      select: () => q,
      returns: async () => execute(),
      eq: (key: string, expected: unknown) => {
        filters.push((row) => value(row, key) === expected);
        return q;
      },
      is: (key: string, expected: unknown) => {
        filters.push((row) => (value(row, key) ?? null) === expected);
        return q;
      },
      in: (key: string, expected: unknown[]) => {
        filters.push((row) => expected.includes(value(row, key)));
        return q;
      },
      gte: (key: string, expected: unknown) => {
        filters.push((row) => String(value(row, key)) >= String(expected));
        return q;
      },
      lte: (key: string, expected: unknown) => {
        filters.push((row) => String(value(row, key)) <= String(expected));
        return q;
      },
      order: (key: string, options?: { ascending?: boolean }) => {
        orders.push({ key, ascending: options?.ascending ?? true });
        return q;
      },
      limit: (count: number) => {
        maximum = count;
        return q;
      },
      range: (from: number, to: number) => {
        start = from;
        maximum = to - from + 1;
        return q;
      },
      update: (patch: Row) => {
        operation = "update";
        payload = patch;
        return q;
      },
      delete: () => {
        operation = "delete";
        return q;
      },
      insert: (row: Row | Row[]) => {
        operation = "insert";
        payload = row;
        return q;
      },
      upsert: (row: Row | Row[], options: { onConflict: string }) => {
        operation = "upsert";
        payload = row;
        conflictKeys = options.onConflict.split(",");
        return q;
      },
      maybeSingle: async () => {
        const result = execute();
        return { ...result, data: result.data?.[0] ?? null };
      },
      single: async () => q.maybeSingle(),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables, failures };
}
