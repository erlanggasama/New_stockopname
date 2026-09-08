import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStockEntryBody,
  ListStockEntriesQueryParams,
  RetryStockEntrySyncParams,
} from "@workspace/api-zod";
import { db, stockEntriesTable, type StockEntry } from "@workspace/db";
import { logger } from "../lib/logger";
import { syncStockEntryToSpreadsheet } from "../lib/stock-sync";

const router: IRouter = Router();

function responseData(entry: StockEntry) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    syncedAt: entry.syncedAt?.toISOString() ?? null,
  };
}

async function updateSyncStatus(entry: StockEntry) {
  try {
    await syncStockEntryToSpreadsheet(entry);
    const [updated] = await db
      .update(stockEntriesTable)
      .set({
        syncStatus: "synced",
        syncError: null,
        syncedAt: new Date(),
      })
      .where(eq(stockEntriesTable.id, entry.id))
      .returning();
    return updated ?? entry;
  } catch (error) {
    const syncError = error instanceof Error ? error.message : "Unknown spreadsheet error.";
    logger.warn({ entryId: entry.id, err: error }, "Spreadsheet synchronization failed");
    const [updated] = await db
      .update(stockEntriesTable)
      .set({
        syncStatus: "failed",
        syncError,
      })
      .where(eq(stockEntriesTable.id, entry.id))
      .returning();
    return updated ?? entry;
  }
}

router.get("/stock-entries", async (req, res) => {
  const parsed = ListStockEntriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter filter tidak valid." });
    return;
  }

  const conditions = parsed.data.store
    ? [eq(stockEntriesTable.store, parsed.data.store)]
    : [];
  const entries = await db
    .select()
    .from(stockEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(stockEntriesTable.createdAt))
    .limit(parsed.data.limit ?? 25);

  res.json(entries.map(responseData));
});

router.post("/stock-entries", async (req, res) => {
  const parsed = CreateStockEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data stok tidak valid." });
    return;
  }

  const existing = await db
    .select()
    .from(stockEntriesTable)
    .where(eq(stockEntriesTable.clientId, parsed.data.clientId))
    .limit(1);
  if (existing[0]) {
    res.status(201).json(responseData(existing[0]));
    return;
  }

  const [created] = await db
    .insert(stockEntriesTable)
    .values({
      ...parsed.data,
      syncStatus: "pending",
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Data stok gagal disimpan di server." });
    return;
  }

  const updated = await updateSyncStatus(created);
  res.status(201).json(responseData(updated));
});

router.post("/stock-entries/:id/retry-sync", async (req, res) => {
  const parsed = RetryStockEntrySyncParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "Data stok tidak ditemukan." });
    return;
  }

  const [entry] = await db
    .select()
    .from(stockEntriesTable)
    .where(eq(stockEntriesTable.id, parsed.data.id))
    .limit(1);
  if (!entry) {
    res.status(404).json({ error: "Data stok tidak ditemukan." });
    return;
  }

  const updated = await updateSyncStatus(entry);
  res.json(responseData(updated));
});

export default router;