"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Unit = {
  id: number;
  unit_number: number;
  unit_name: string | null;
  active: boolean;
};

type CleaningSession = {
  id: number;
  unit_id: number;
  status: string;
  started_by: string | null;
  last_updated_by: string | null;
  notes: string | null;
  started_at: string | null;
  last_updated_at: string | null;
  completed_at: string | null;
};

type ChecklistItem = {
  id: number;
  label: string;
  section: string;
  sort_order: number;
  active: boolean;
};

type ChecklistResponse = {
  id: number;
  cleaning_session_id: number;
  checklist_item_id: number;
  checked: boolean;
  updated_by: string | null;
  updated_at: string;
};

type CleaningUpdate = {
  id: number;
  cleaning_session_id: number;
  message: string;
  created_by: string | null;
  created_at: string;
};

type FilterType = "all" | "required";

const openStatuses = [
  "Needs Cleaning",
  "In Progress",
  "Paused",
  "Ready for Inspection",
];

const cleaningRequiredStatuses = [
  "Needs Cleaning",
  "In Progress",
  "Paused",
  "Ready for Inspection",
];

const statusStyles: Record<string, string> = {
  "No Cleaning Required": "bg-gray-100 text-gray-600",
  "Needs Cleaning": "bg-red-100 text-red-700",
  "In Progress": "bg-orange-100 text-orange-700",
  Paused: "bg-yellow-100 text-yellow-700",
  "Ready for Inspection": "bg-blue-100 text-blue-700",
  Ready: "bg-green-100 text-green-700",
};

export default function HousekeepingPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [sessions, setSessions] = useState<CleaningSession[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [responses, setResponses] = useState<ChecklistResponse[]>([]);
  const [updates, setUpdates] = useState<CleaningUpdate[]>([]);

  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  async function loadData() {
    setLoading(true);

    const [
      unitsResult,
      sessionsResult,
      checklistResult,
      responsesResult,
      updatesResult,
    ] = await Promise.all([
      supabase
        .from("units")
        .select("*")
        .eq("active", true)
        .order("unit_number"),

      supabase
        .from("cleaning_sessions")
        .select("*")
        .order("last_updated_at", { ascending: false }),

      supabase
        .from("cleaning_checklist_items")
        .select("*")
        .eq("active", true)
        .order("sort_order"),

      supabase
        .from("cleaning_checklist_responses")
        .select("*"),

      supabase
        .from("cleaning_updates")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (unitsResult.error) {
      console.error("Error loading units:", unitsResult.error);
    }

    if (sessionsResult.error) {
      console.error(
        "Error loading cleaning sessions:",
        sessionsResult.error
      );
    }

    if (checklistResult.error) {
      console.error("Error loading checklist:", checklistResult.error);
    }

    if (responsesResult.error) {
      console.error(
        "Error loading checklist responses:",
        responsesResult.error
      );
    }

    if (updatesResult.error) {
      console.error("Error loading updates:", updatesResult.error);
    }

    setUnits(unitsResult.data ?? []);
    setSessions(sessionsResult.data ?? []);
    setChecklistItems(checklistResult.data ?? []);
    setResponses(responsesResult.data ?? []);
    setUpdates(updatesResult.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function getCurrentSession(unitId: number) {
    return sessions.find(
      (session) =>
        session.unit_id === unitId &&
        openStatuses.includes(session.status)
    );
  }

  function getUnitStatus(unitId: number) {
    const currentSession = getCurrentSession(unitId);

    if (currentSession) {
      return currentSession.status;
    }

    const lastReadySession = sessions.find(
      (session) =>
        session.unit_id === unitId &&
        session.status === "Ready"
    );

    if (lastReadySession) {
      return "Ready";
    }

    return "No Cleaning Required";
  }

  function getSessionProgress(sessionId: number) {
    if (checklistItems.length === 0) {
      return 0;
    }

    const completedItems = responses.filter(
      (response) =>
        response.cleaning_session_id === sessionId &&
        response.checked
    );

    return Math.round(
      (completedItems.length / checklistItems.length) * 100
    );
  }

  async function markForCleaning(unitId: number) {
    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    const existingSession = getCurrentSession(unitId);

    if (existingSession) {
      setSelectedUnitId(unitId);
      return;
    }

    const { data, error } = await supabase
      .from("cleaning_sessions")
      .insert([
        {
          unit_id: unitId,
          status: "Needs Cleaning",
          started_by: null,
          started_at: null,
          last_updated_by: staffName.trim(),
          last_updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error marking unit for cleaning:", error);
      alert("There was an error marking this unit for cleaning.");
      return;
    }

    await supabase.from("cleaning_updates").insert([
      {
        cleaning_session_id: data.id,
        message: "Marked for cleaning",
        created_by: staffName.trim(),
      },
    ]);

    await loadData();
  }

  async function startCleaning(session: CleaningSession) {
    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("cleaning_sessions")
      .update({
        status: "In Progress",
        started_by: session.started_by || staffName.trim(),
        started_at: session.started_at || now,
        last_updated_by: staffName.trim(),
        last_updated_at: now,
      })
      .eq("id", session.id);

    if (error) {
      console.error("Error starting cleaning:", error);
      alert("There was an error starting this cleaning.");
      return;
    }

    await supabase.from("cleaning_updates").insert([
      {
        cleaning_session_id: session.id,
        message: "Cleaning started",
        created_by: staffName.trim(),
      },
    ]);

    await loadData();
  }

  async function removeFromCleaningList(
    session: CleaningSession
  ) {
    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    const confirmed = window.confirm(
      "Remove this unit from the cleaning list?"
    );

    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("cleaning_sessions")
      .update({
        status: "Cancelled",
        last_updated_by: staffName.trim(),
        last_updated_at: now,
        completed_at: now,
      })
      .eq("id", session.id);

    if (error) {
      console.error("Error removing unit:", error);
      alert("There was an error removing this unit.");
      return;
    }

    await supabase.from("cleaning_updates").insert([
      {
        cleaning_session_id: session.id,
        message: "Removed from cleaning list",
        created_by: staffName.trim(),
      },
    ]);

    await loadData();
  }

  async function changeStatus(
    session: CleaningSession,
    newStatus: string
  ) {
    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    const now = new Date().toISOString();

    const updateData: {
      status: string;
      last_updated_by: string;
      last_updated_at: string;
      completed_at?: string | null;
    } = {
      status: newStatus,
      last_updated_by: staffName.trim(),
      last_updated_at: now,
    };

    if (newStatus === "Ready") {
      updateData.completed_at = now;
    }

    const { error } = await supabase
      .from("cleaning_sessions")
      .update(updateData)
      .eq("id", session.id);

    if (error) {
      console.error("Error updating cleaning status:", error);
      alert("There was an error updating the status.");
      return;
    }

    await supabase.from("cleaning_updates").insert([
      {
        cleaning_session_id: session.id,
        message: `Status changed to ${newStatus}`,
        created_by: staffName.trim(),
      },
    ]);

    await loadData();
  }

  async function toggleChecklistItem(
    sessionId: number,
    checklistItemId: number,
    checked: boolean
  ) {
    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    const existing = responses.find(
      (response) =>
        response.cleaning_session_id === sessionId &&
        response.checklist_item_id === checklistItemId
    );

    if (existing) {
      const { error } = await supabase
        .from("cleaning_checklist_responses")
        .update({
          checked,
          updated_by: staffName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating checklist:", error);
        return;
      }
    } else {
      const { error } = await supabase
        .from("cleaning_checklist_responses")
        .insert([
          {
            cleaning_session_id: sessionId,
            checklist_item_id: checklistItemId,
            checked,
            updated_by: staffName.trim(),
            updated_at: new Date().toISOString(),
          },
        ]);

      if (error) {
        console.error("Error creating checklist response:", error);
        return;
      }
    }

    await supabase
      .from("cleaning_sessions")
      .update({
        last_updated_by: staffName.trim(),
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    await loadData();
  }

  async function addUpdate(sessionId: number) {
    if (!updateMessage.trim()) {
      return;
    }

    if (!staffName.trim()) {
      alert("Please enter your name first.");
      return;
    }

    setSavingUpdate(true);

    const { error } = await supabase
      .from("cleaning_updates")
      .insert([
        {
          cleaning_session_id: sessionId,
          message: updateMessage.trim(),
          created_by: staffName.trim(),
        },
      ]);

    setSavingUpdate(false);

    if (error) {
      console.error("Error adding update:", error);
      alert("There was an error saving the update.");
      return;
    }

    await supabase
      .from("cleaning_sessions")
      .update({
        last_updated_by: staffName.trim(),
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    setUpdateMessage("");

    await loadData();
  }

  const sections = useMemo(() => {
    const grouped: Record<string, ChecklistItem[]> = {};

    checklistItems.forEach((item) => {
      if (!grouped[item.section]) {
        grouped[item.section] = [];
      }

      grouped[item.section].push(item);
    });

    return grouped;
  }, [checklistItems]);

  const statusCounts = units.reduce(
    (counts, unit) => {
      const status = getUnitStatus(unit.id);

      counts[status] = (counts[status] ?? 0) + 1;

      return counts;
    },
    {} as Record<string, number>
  );

  const visibleUnits = units.filter((unit) => {
    if (filter === "all") {
      return true;
    }

    return cleaningRequiredStatuses.includes(
      getUnitStatus(unit.id)
    );
  });

  const selectedUnit =
    units.find((unit) => unit.id === selectedUnitId) ?? null;

  const selectedSession = selectedUnit
    ? getCurrentSession(selectedUnit.id)
    : undefined;

  const selectedStatus = selectedUnit
    ? getUnitStatus(selectedUnit.id)
    : "No Cleaning Required";

  const selectedResponses = selectedSession
    ? responses.filter(
        (response) =>
          response.cleaning_session_id === selectedSession.id
      )
    : [];

  const selectedUpdates = selectedSession
    ? updates.filter(
        (update) =>
          update.cleaning_session_id === selectedSession.id
      )
    : [];

  const checkedItemIds = new Set(
    selectedResponses
      .filter((response) => response.checked)
      .map((response) => response.checklist_item_id)
  );

  const completedChecklistCount = checkedItemIds.size;

  const checklistTotal = checklistItems.length;

  const progressPercent =
    checklistTotal === 0
      ? 0
      : Math.round(
          (completedChecklistCount / checklistTotal) * 100
        );

  // ----------------------------------
  // INDIVIDUAL UNIT VIEW
  // ----------------------------------

  if (selectedUnit) {
    return (
      <main className="min-h-screen bg-gray-100 p-4">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => setSelectedUnitId(null)}
            className="mb-4 text-sm text-gray-500 underline"
          >
            ← Back to Housekeeping
          </button>

          <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase text-gray-400">
                  Unit
                </p>

                <h1 className="text-3xl font-bold text-gray-900">
                  {selectedUnit.unit_number}
                </h1>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusStyles[selectedStatus] ??
                  "bg-gray-100 text-gray-700"
                }`}
              >
                {selectedStatus}
              </span>
            </div>

            {!selectedSession ? (
              <div className="mt-5">
                {selectedStatus === "Ready" ? (
                  <p className="text-sm text-gray-500">
                    This unit was previously completed and is ready.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">
                    This unit is not currently scheduled for
                    cleaning.
                  </p>
                )}

                <button
                  onClick={() =>
                    markForCleaning(selectedUnit.id)
                  }
                  className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white"
                >
                  Mark for Cleaning
                </button>
              </div>
            ) : selectedSession.status === "Needs Cleaning" ? (
              <div className="mt-5">
                <p className="text-sm text-gray-500">
                  This unit has been added to the cleaning list
                  but cleaning has not started yet.
                </p>

                <button
                  onClick={() =>
                    startCleaning(selectedSession)
                  }
                  className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white"
                >
                  Start Cleaning
                </button>

                <button
                  onClick={() =>
                    removeFromCleaningList(selectedSession)
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-600"
                >
                  Remove from Cleaning List
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>Cleaning progress</span>

                    <span>
                      {completedChecklistCount}/{checklistTotal}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-black transition-all"
                      style={{
                        width: `${progressPercent}%`,
                      }}
                    />
                  </div>

                  <p className="mt-1 text-right text-xs font-semibold text-gray-600">
                    {progressPercent}%
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {selectedSession.status !== "In Progress" && (
                    <button
                      onClick={() =>
                        changeStatus(
                          selectedSession,
                          "In Progress"
                        )
                      }
                      className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-700"
                    >
                      Resume
                    </button>
                  )}

                  {selectedSession.status !== "Paused" && (
                    <button
                      onClick={() =>
                        changeStatus(
                          selectedSession,
                          "Paused"
                        )
                      }
                      className="rounded-lg bg-yellow-100 px-3 py-2 text-sm font-semibold text-yellow-700"
                    >
                      Pause
                    </button>
                  )}

                  <button
                    onClick={() =>
                      changeStatus(
                        selectedSession,
                        "Ready for Inspection"
                      )
                    }
                    className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700"
                  >
                    Ready for Inspection
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(
                        selectedSession,
                        "Ready"
                      )
                    }
                    className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Mark Ready
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-2 font-semibold text-gray-900">
              Staff
            </p>

            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />

            {selectedSession && (
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {selectedSession.started_by && (
                  <p>
                    Started by: {selectedSession.started_by}
                  </p>
                )}

                {selectedSession.last_updated_by && (
                  <p>
                    Last updated by:{" "}
                    {selectedSession.last_updated_by}
                  </p>
                )}

                {selectedSession.started_at && (
                  <p>
                    Started:{" "}
                    {new Date(
                      selectedSession.started_at
                    ).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {selectedSession &&
            selectedSession.status !== "Needs Cleaning" && (
              <>
                <div className="space-y-4">
                  {Object.entries(sections).map(
                    ([section, items]) => (
                      <div
                        key={section}
                        className="rounded-2xl bg-white p-4 shadow-sm"
                      >
                        <h2 className="mb-3 font-bold text-gray-900">
                          {section}
                        </h2>

                        <div className="space-y-3">
                          {items.map((item) => {
                            const checked =
                              checkedItemIds.has(item.id);

                            return (
                              <label
                                key={item.id}
                                className="flex cursor-pointer items-center gap-3"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    toggleChecklistItem(
                                      selectedSession.id,
                                      item.id,
                                      e.target.checked
                                    )
                                  }
                                  className="h-5 w-5"
                                />

                                <span
                                  className={`text-sm ${
                                    checked
                                      ? "text-gray-400 line-through"
                                      : "text-gray-700"
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
                  <h2 className="font-bold text-gray-900">
                    Cleaning Updates
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Leave information for whoever continues the
                    room.
                  </p>

                  <textarea
                    value={updateMessage}
                    onChange={(e) =>
                      setUpdateMessage(e.target.value)
                    }
                    placeholder="e.g. Bathroom finished. Need fresh linen and floors still need to be done."
                    rows={3}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />

                  <button
                    onClick={() =>
                      addUpdate(selectedSession.id)
                    }
                    disabled={savingUpdate}
                    className="mt-3 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {savingUpdate
                      ? "Saving..."
                      : "Add Update"}
                  </button>

                  {selectedUpdates.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-400">
                      No updates yet.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {selectedUpdates.map((update) => (
                        <div
                          key={update.id}
                          className="rounded-xl bg-gray-50 p-3"
                        >
                          <p className="text-sm text-gray-700">
                            {update.message}
                          </p>

                          <div className="mt-2 flex justify-between gap-3 text-xs text-gray-400">
                            <span>
                              {update.created_by ||
                                "Not recorded"}
                            </span>

                            <span>
                              {new Date(
                                update.created_at
                              ).toLocaleString("en-AU", {
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
      </main>
    );
  }

  // ----------------------------------
  // MAIN HOUSEKEEPING BOARD
  // ----------------------------------

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-gray-500 underline"
        >
          ← Back to Task Board
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Housekeeping
          </h1>

          <p className="text-gray-500">
            Live cleaning status for all units
          </p>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Your name
          </label>

          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="Enter your name before updating rooms"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-red-50 p-3 text-center">
            <p className="text-xl font-bold text-red-700">
              {statusCounts["Needs Cleaning"] ?? 0}
            </p>
            <p className="text-xs text-red-600">
              Needs Cleaning
            </p>
          </div>

          <div className="rounded-xl bg-orange-50 p-3 text-center">
            <p className="text-xl font-bold text-orange-700">
              {statusCounts["In Progress"] ?? 0}
            </p>
            <p className="text-xs text-orange-600">
              In Progress
            </p>
          </div>

          <div className="rounded-xl bg-yellow-50 p-3 text-center">
            <p className="text-xl font-bold text-yellow-700">
              {statusCounts["Paused"] ?? 0}
            </p>
            <p className="text-xs text-yellow-600">
              Paused
            </p>
          </div>

          <div className="rounded-xl bg-blue-50 p-3 text-center">
            <p className="text-xl font-bold text-blue-700">
              {statusCounts["Ready for Inspection"] ?? 0}
            </p>
            <p className="text-xs text-blue-600">
              Inspection
            </p>
          </div>

          <div className="rounded-xl bg-green-50 p-3 text-center">
            <p className="text-xl font-bold text-green-700">
              {statusCounts["Ready"] ?? 0}
            </p>
            <p className="text-xs text-green-600">
              Ready
            </p>
          </div>

          <div className="rounded-xl bg-gray-200 p-3 text-center">
            <p className="text-xl font-bold text-gray-700">
              {statusCounts["No Cleaning Required"] ?? 0}
            </p>
            <p className="text-xs text-gray-600">
              No Cleaning
            </p>
          </div>
        </div>

        <div className="mb-5 flex rounded-xl bg-white p-1 shadow-sm">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              filter === "all"
                ? "bg-black text-white"
                : "text-gray-500"
            }`}
          >
            All Units
          </button>

          <button
            onClick={() => setFilter("required")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              filter === "required"
                ? "bg-black text-white"
                : "text-gray-500"
            }`}
          >
            Cleaning Required
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500">
            Loading housekeeping...
          </p>
        ) : visibleUnits.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-gray-800">
              No units require cleaning 🎉
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Switch to All Units to mark a unit for cleaning.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleUnits.map((unit) => {
              const status = getUnitStatus(unit.id);
              const session = getCurrentSession(unit.id);

              const progress = session
                ? getSessionProgress(session.id)
                : status === "Ready"
                ? 100
                : 0;

              return (
                <button
                  key={unit.id}
                  onClick={() =>
                    setSelectedUnitId(unit.id)
                  }
                  className="rounded-2xl bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase text-gray-400">
                        Unit
                      </p>

                      <p className="text-2xl font-bold text-gray-900">
                        {unit.unit_number}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        statusStyles[status] ??
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        Progress
                      </span>

                      <span className="text-xs font-semibold text-gray-700">
                        {progress}%
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-black transition-all"
                        style={{
                          width: `${progress}%`,
                        }}
                      />
                    </div>
                  </div>

                  {session?.last_updated_at && (
                    <p className="mt-3 text-xs text-gray-400">
                      Updated{" "}
                      {new Date(
                        session.last_updated_at
                      ).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );