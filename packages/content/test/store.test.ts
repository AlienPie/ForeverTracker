import { describe, expect, test } from "vitest";
import { openDb } from "@ft/db";
import { getRecord, listRecords } from "../src/index";
import { putRecord } from "../src/mirror/store";

describe("store", () => {
  test("round-trips JSON with build and fetchedAt, numeric and string keys", () => {
    const db = openDb(":memory:");
    putRecord(db, "r", "7", { a: 1 }, "B1", 100);
    putRecord(db, "r", "mage", { n: "mage" }, "B1", 101);
    putRecord(db, "r", "mage@100", { n: "page2" }, "B1", 102);
    expect(getRecord(db, "r", "7")).toEqual({ data: { a: 1 }, build: "B1", fetchedAt: 100 });
    expect(getRecord(db, "r", "mage")?.data).toEqual({ n: "mage" });
    expect(getRecord(db, "r", "mage@100")?.data).toEqual({ n: "page2" });
    expect(getRecord(db, "r", "missing")).toBeNull();
  });

  test("putRecord upserts", () => {
    const db = openDb(":memory:");
    putRecord(db, "r", "1", { v: 1 }, "A", 1);
    putRecord(db, "r", "1", { v: 2 }, "B", 2);
    expect(getRecord(db, "r", "1")).toEqual({ data: { v: 2 }, build: "B", fetchedAt: 2 });
    expect(listRecords(db, "r")).toHaveLength(1);
  });

  test("listRecords is scoped per resource and honours limit/offset", () => {
    const db = openDb(":memory:");
    for (let i = 1; i <= 5; i++) putRecord(db, "r", String(i), { i }, "A", 1);
    putRecord(db, "other", "1", { x: 1 }, "A", 1);
    expect(listRecords(db, "r")).toHaveLength(5);
    expect(listRecords(db, "r", { limit: 2, offset: 1 })).toEqual([{ i: 2 }, { i: 3 }]);
  });
});
