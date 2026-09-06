"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthGuard";

type StockStatus = "Not Counted" | "Good" | "Low Stock" | "Out of Stock";

type InventoryItem = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  quantity_per_unit: number | null;
  stock_status: StockStatus;
  last_comment: string | null;
  active: boolean;
  updated_by_name: string | null;
  updated_at: string;
};

type InventoryHistory = {
  id: number;
  item_id: number;
  previous_quantity: number | null;
  new_quantity: number;
  previous_status: string | null;
  new_status: string;
  comment: string | null;
  updated_by_name: string | null;
  created_at: string;
};

const categoryOrder = [
  "Linen",
  "Towels",
  "Guest Amenities",
  "Bathroom Supplies",
];

const statusStyles: Record<StockStatus, string> = {
  "Not Counted": "bg-gray-100 text-gray-700",
  Good: "bg-green-100 text-green-700",
  "Low Stock": "bg-orange-100 text-orange-700",
  "Out of Stock": "bg-red-100 text-red-700",
};

export default function StockPage() {
  const { user, userName, canEdit } = useAuth();
  const canEditStock = canEdit("stock");
  const currentStaffName = userName?.trim() || "Unknown user";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<InventoryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("0");
  const [status, setStatus] = useState<StockStatus>("Not Counted");
  const [comment, setComment] = useState("");

  async function loadData() {
    setLoading(true);

    const [itemsResult, historyResult] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("inventory_history")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (itemsResult.error) {
      console.error("Error loading inventory:", itemsResult.error);
      alert("There was an error loading the stock.");
    }

    if (historyResult.error) {
      console.error("Error loading inventory history:", historyResult.error);
    }

    setItems((itemsResult.data ?? []) as InventoryItem[]);
    setHistory((historyResult.data ?? []) as InventoryHistory[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const calculation = useMemo(() => {
    const fixedItems = items.filter((item) => item.quantity_per_unit !== null);
    const notCounted = fixedItems.filter(
      (item) => item.stock_status === "Not Counted",
    );

    if (fixedItems.length === 0 || notCounted.length > 0) {
      return {
        ready: false,
        missing: notCounted.length,
        units: 0,
        limitingItems: [] as string[],
      };
    }

    const coverage = fixedItems.map((item) => ({
      name: item.name,
      units: Math.floor(item.quantity / (item.quantity_per_unit ?? 1)),
    }));
    const minimum = Math.min(...coverage.map((item) => item.units));

    return {
      ready: true,
      missing: 0,
      units: minimum,
      limitingItems: coverage
        .filter((item) => item.units === minimum)
        .map((item) => item.name),
    };
  }, [items]);

  const attentionItems = items.filter(
    (item) =>
      item.stock_status === "Low Stock" || item.stock_status === "Out of Stock",
  );

  const groupedItems = useMemo(() => {
    const grouped = new Map<string, InventoryItem[]>();

    items.forEach((item) => {
      const current = grouped.get(item.category) ?? [];
      current.push(item);
      grouped.set(item.category, current);
    });

    return categoryOrder
      .filter((category) => grouped.has(category))
      .map((category) => ({
        category,
        items: grouped.get(category) ?? [],
      }));
  }, [items]);

  function openUpdate(item: InventoryItem) {
    setSelectedItemId(item.id);
    setQuantity(String(item.quantity));
    setStatus(item.stock_status);
    setComment("");
  }

  async function saveUpdate() {
    if (!canEditStock || !user || selectedItemId === null) return;

    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      alert("Please enter a whole number of 0 or more.");
      return;
    }

    if (status === "Not Counted") {
      alert("Please select the current stock status.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("inventory_items")
      .update({
        quantity: parsedQuantity,
        stock_status: status,
        last_comment: comment.trim() || null,
        updated_by: user.id,
        updated_by_name: currentStaffName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedItemId);

    setSaving(false);

    if (error) {
      console.error("Error updating inventory:", error);
      alert("There was an error saving the stock update.");
      return;
    }

    setSelectedItemId(null);
    setComment("");
    await loadData();
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-5">
          <Link href="/" className="text-sm text-gray-500 underline">
            ← Back to Task Board
          </Link>

          <h1 className="mt-4 text-2xl font-bold text-gray-900">Linen Stock</h1>
          <p className="text-gray-500">Linen, towels and guest supplies</p>

          {!canEditStock && (
            <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              View only — you cannot update stock.
            </div>
          )}
        </div>

        {!loading && (
          <>
            <section className="mb-4 rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
              {calculation.ready ? (
                <>
                  <p className="text-sm text-slate-300">
                    Full 6-guest setups available
                  </p>
                  <p className="mt-1 text-4xl font-bold">{calculation.units}</p>
                  <p className="mt-3 text-sm text-slate-300">
                    Limiting item
                    {calculation.limitingItems.length === 1 ? "" : "s"}:{" "}
                    {calculation.limitingItems.join(", ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Initial count incomplete</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Count {calculation.missing} more fixed-stock item
                    {calculation.missing === 1 ? "" : "s"} to calculate complete
                    units.
                  </p>
                </>
              )}
            </section>

            <section className="mb-6 rounded-xl bg-white p-4 shadow-sm">
              <p className="font-semibold text-gray-900">
                {attentionItems.length} item
                {attentionItems.length === 1 ? "" : "s"} need attention
              </p>

              {attentionItems.length === 0 ? (
                <p className="mt-1 text-sm text-green-700">
                  No products are currently marked low or out of stock.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-gray-700">{item.name}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[item.stock_status]}`}
                      >
                        {item.stock_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {loading && <p className="text-gray-500">Loading stock...</p>}

        {!loading && (
          <div className="space-y-7">
            {groupedItems.map((group) => (
              <section key={group.category}>
                <h2 className="mb-3 text-lg font-bold text-gray-900">
                  {group.category}
                </h2>

                <div className="space-y-3">
                  {group.items.map((item) => {
                    const itemHistory = history.filter(
                      (entry) => entry.item_id === item.id,
                    );
                    const isEditing = selectedItemId === item.id;
                    const isShowingHistory = historyItemId === item.id;
                    const unitCoverage = item.quantity_per_unit
                      ? Math.floor(item.quantity / item.quantity_per_unit)
                      : null;

                    return (
                      <article
                        key={item.id}
                        className="rounded-xl bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {item.name}
                            </h3>
                            <p className="mt-1 text-2xl font-bold text-gray-900">
                              {item.quantity}
                            </p>
                            {item.quantity_per_unit ? (
                              <p className="text-xs text-gray-500">
                                {item.quantity_per_unit} per unit · enough for{" "}
                                {unitCoverage} unit
                                {unitCoverage === 1 ? "" : "s"}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500">
                                Tracked stock — excluded from unit calculation
                              </p>
                            )}
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.stock_status]}`}
                          >
                            {item.stock_status}
                          </span>
                        </div>

                        {item.last_comment && (
                          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                            {item.last_comment}
                          </p>
                        )}

                        {item.updated_by_name && (
                          <p className="mt-3 text-xs text-gray-500">
                            Updated by {item.updated_by_name} ·{" "}
                            {formatDate(item.updated_at)}
                          </p>
                        )}

                        <div className="mt-4 flex gap-2">
                          {canEditStock && (
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setSelectedItemId(null)
                                  : openUpdate(item)
                              }
                              className="flex-1 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white"
                            >
                              {isEditing ? "Cancel" : "Update stock"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setHistoryItemId(
                                isShowingHistory ? null : item.id,
                              )
                            }
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                          >
                            {isShowingHistory ? "Hide history" : "History"}
                          </button>
                        </div>

                        {isEditing && (
                          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Current quantity
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={quantity}
                                onChange={(event) =>
                                  setQuantity(event.target.value)
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Stock status
                              </label>
                              <select
                                value={status}
                                onChange={(event) =>
                                  setStatus(event.target.value as StockStatus)
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              >
                                <option value="Not Counted">Not Counted</option>
                                <option value="Good">Good</option>
                                <option value="Low Stock">Low Stock</option>
                                <option value="Out of Stock">
                                  Out of Stock
                                </option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Comment
                              </label>
                              <textarea
                                value={comment}
                                onChange={(event) =>
                                  setComment(event.target.value)
                                }
                                placeholder="Optional note about this stock"
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>

                            <p className="text-xs text-gray-500">
                              This update will be saved as {currentStaffName}.
                            </p>

                            <button
                              type="button"
                              onClick={saveUpdate}
                              disabled={saving}
                              className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save stock update"}
                            </button>
                          </div>
                        )}

                        {isShowingHistory && (
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <h4 className="font-semibold text-gray-900">
                              Update history
                            </h4>

                            {itemHistory.length === 0 ? (
                              <p className="mt-2 text-sm text-gray-500">
                                No stock updates yet.
                              </p>
                            ) : (
                              <div className="mt-3 space-y-3">
                                {itemHistory.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="rounded-lg bg-gray-50 p-3"
                                  >
                                    <p className="text-sm font-medium text-gray-800">
                                      Quantity: {entry.previous_quantity ?? 0} →{" "}
                                      {entry.new_quantity}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600">
                                      Status:{" "}
                                      {entry.previous_status || "Not Counted"} →{" "}
                                      {entry.new_status}
                                    </p>
                                    {entry.comment && (
                                      <p className="mt-2 text-sm text-gray-600">
                                        {entry.comment}
                                      </p>
                                    )}
                                    <p className="mt-2 text-xs text-gray-500">
                                      {entry.updated_by_name || "Unknown user"}{" "}
                                      · {formatDate(entry.created_at)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
