"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthGuard";

type Unit = {
  id: number;
  unit_number: number;
  unit_name: string | null;
  active: boolean;
};

type Task = {
  id: number;
  title: string;
  area: string | null;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
  notes: string | null;
  unit_scope: string;
  unit_numbers: number[];
  unit_progress: TaskUnitProgress[];
  note_history: TaskNote[];
};

type TaskUnitProgress = {
  unit_id: number;
  unit_number: number;
  is_completed: boolean;
  completed_by_name: string | null;
  completed_at: string | null;
};

type TaskNote = {
  id: number;
  task_id: number;
  note: string;
  created_by_name: string;
  created_at: string;
};

export default function Home() {
  const { user, userName, canEdit } = useAuth();
  const canEditTasks = canEdit("tasks");
  const currentStaffName = userName?.trim() || "Unknown user";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("All");

  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [newTask, setNewTask] = useState({
    title: "",
    area: "",
    priority: "Medium",
    assigned_to: "",
    due_date: "",
    notes: "",
    unit_scope: "none",
  });

  async function loadData() {
    setLoading(true);

    const [tasksResult, unitsResult, taskUnitsResult, taskNotesResult] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("units")
          .select("*")
          .eq("active", true)
          .order("unit_number", { ascending: true }),

        supabase
          .from("task_units")
          .select(
            "task_id, unit_id, is_completed, completed_by_name, completed_at",
          ),

        supabase
          .from("task_notes")
          .select("id, task_id, note, created_by_name, created_at")
          .order("created_at", { ascending: false }),
      ]);

    if (tasksResult.error) {
      console.error("Error loading tasks:", tasksResult.error);
    }

    if (unitsResult.error) {
      console.error("Error loading units:", unitsResult.error);
    }

    if (taskUnitsResult.error) {
      console.error("Error loading task units:", taskUnitsResult.error);
    }

    if (taskNotesResult.error) {
      console.error("Error loading task notes:", taskNotesResult.error);
    }

    const loadedUnits: Unit[] = unitsResult.data ?? [];

    setUnits(loadedUnits);

    const unitNumberById = new Map<number, number>();

    loadedUnits.forEach((unit) => {
      unitNumberById.set(unit.id, unit.unit_number);
    });

    const unitsByTask = new Map<number, number[]>();
    const unitProgressByTask = new Map<number, TaskUnitProgress[]>();

    (taskUnitsResult.data ?? []).forEach((relation) => {
      const unitNumber = unitNumberById.get(relation.unit_id);

      if (!unitNumber) return;

      const current = unitsByTask.get(relation.task_id) ?? [];

      current.push(unitNumber);

      unitsByTask.set(relation.task_id, current);

      const currentProgress = unitProgressByTask.get(relation.task_id) ?? [];

      currentProgress.push({
        unit_id: relation.unit_id,
        unit_number: unitNumber,
        is_completed: relation.is_completed ?? false,
        completed_by_name: relation.completed_by_name ?? null,
        completed_at: relation.completed_at ?? null,
      });

      unitProgressByTask.set(relation.task_id, currentProgress);
    });

    const notesByTask = new Map<number, TaskNote[]>();

    (taskNotesResult.data ?? []).forEach((note) => {
      const current = notesByTask.get(note.task_id) ?? [];
      current.push(note as TaskNote);
      notesByTask.set(note.task_id, current);
    });

    const loadedTasks: Task[] = (tasksResult.data ?? []).map((task) => ({
      ...task,
      unit_scope: task.unit_scope ?? "none",
      unit_numbers: (unitsByTask.get(task.id) ?? []).sort((a, b) => a - b),
      unit_progress: (unitProgressByTask.get(task.id) ?? []).sort(
        (a, b) => a.unit_number - b.unit_number,
      ),
      note_history: notesByTask.get(task.id) ?? [],
    }));

    setTasks(loadedTasks);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function updateStatus(id: number, newStatus: string) {
    if (!canEditTasks) return;

    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at:
          newStatus === "Completed" ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating task:", error);
      alert("There was an error updating the task.");
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, status: newStatus } : task,
      ),
    );
  }

  async function toggleTaskUnit(task: Task, unitProgress: TaskUnitProgress) {
    if (!canEditTasks || !user) return;

    const nextCompleted = !unitProgress.is_completed;
    const now = new Date().toISOString();

    const { error: unitError } = await supabase
      .from("task_units")
      .update({
        is_completed: nextCompleted,
        completed_by: nextCompleted ? user.id : null,
        completed_by_name: nextCompleted ? currentStaffName : null,
        completed_at: nextCompleted ? now : null,
      })
      .eq("task_id", task.id)
      .eq("unit_id", unitProgress.unit_id);

    if (unitError) {
      console.error("Error updating unit progress:", unitError);
      alert("There was an error updating this unit.");
      return;
    }

    const allCompleted = task.unit_progress.every((item) =>
      item.unit_id === unitProgress.unit_id ? nextCompleted : item.is_completed,
    );

    const nextStatus = allCompleted ? "Completed" : "In Progress";

    const { error: taskError } = await supabase
      .from("tasks")
      .update({
        status: nextStatus,
        completed_at: allCompleted ? now : null,
      })
      .eq("id", task.id);

    if (taskError) {
      console.error("Error updating task status:", taskError);
      alert("The unit was updated, but the task status could not be updated.");
    }

    await loadData();
  }

  async function addTaskNote(taskId: number) {
    if (!canEditTasks || !user || !newNote.trim()) return;

    setSavingNote(true);

    const { error } = await supabase.from("task_notes").insert({
      task_id: taskId,
      note: newNote.trim(),
      created_by: user.id,
      created_by_name: currentStaffName,
    });

    setSavingNote(false);

    if (error) {
      console.error("Error adding task note:", error);
      alert("There was an error saving the note.");
      return;
    }

    setNewNote("");
    await loadData();
  }

  function toggleUnit(unitId: number) {
    setSelectedUnitIds((current) => {
      if (current.includes(unitId)) {
        return current.filter((id) => id !== unitId);
      }

      return [...current, unitId];
    });
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();

    if (!canEditTasks || !user) return;

    if (!newTask.title.trim()) {
      alert("Please enter a task title.");
      return;
    }

    if (newTask.unit_scope === "selected" && selectedUnitIds.length === 0) {
      alert("Please select at least one unit.");
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          title: newTask.title,
          area: newTask.area || null,
          priority: newTask.priority,
          assigned_to: newTask.assigned_to || null,
          due_date: newTask.due_date || null,
          status: "Pending",
          notes: newTask.notes || null,
          is_recurring: false,
          unit_scope: newTask.unit_scope,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating task:", error);
      alert("There was an error creating the task.");
      return;
    }

    const unitIdsToAssign =
      newTask.unit_scope === "all"
        ? units.map((unit) => unit.id)
        : newTask.unit_scope === "selected"
          ? selectedUnitIds
          : [];

    if (unitIdsToAssign.length > 0) {
      const relations = unitIdsToAssign.map((unitId) => ({
        task_id: data.id,
        unit_id: unitId,
      }));

      const { error: unitError } = await supabase
        .from("task_units")
        .insert(relations);

      if (unitError) {
        console.error("Error assigning units:", unitError);

        alert(
          "The task was created, but there was a problem assigning the units.",
        );
      }
    }

    if (newTask.notes.trim()) {
      const { error: noteError } = await supabase.from("task_notes").insert({
        task_id: data.id,
        note: newTask.notes.trim(),
        created_by: user.id,
        created_by_name: currentStaffName,
      });

      if (noteError) {
        console.error("Error saving initial task note:", noteError);
        alert(
          "The task was created, but its initial note could not be added to the history.",
        );
      }
    }

    setNewTask({
      title: "",
      area: "",
      priority: "Medium",
      assigned_to: "",
      due_date: "",
      notes: "",
      unit_scope: "none",
    });

    setSelectedUnitIds([]);
    setShowForm(false);

    await loadData();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function getDueStatus(dueDate: string | null, status: string) {
    if (!dueDate || status === "Completed") {
      return null;
    }

    const due = new Date(`${dueDate}T00:00:00`);

    due.setHours(0, 0, 0, 0);

    if (due < today) {
      return "overdue";
    }

    if (due.getTime() === today.getTime()) {
      return "today";
    }

    return "upcoming";
  }

  function formatDueDate(dueDate: string | null) {
    if (!dueDate) {
      return "No due date";
    }

    return new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getUnitLabel(task: Task) {
    if (task.unit_scope === "all") {
      return "All Units";
    }

    if (task.unit_scope === "selected" && task.unit_numbers.length > 0) {
      if (task.unit_numbers.length === 1) {
        return `Unit ${task.unit_numbers[0]}`;
      }

      return `Units ${task.unit_numbers.join(", ")}`;
    }

    return null;
  }

  const pendingCount = tasks.filter((task) => task.status === "Pending").length;

  const inProgressCount = tasks.filter(
    (task) => task.status === "In Progress",
  ).length;

  const completedCount = tasks.filter(
    (task) => task.status === "Completed",
  ).length;

  const todayCount = tasks.filter((task) => {
    if (!task.due_date || task.status === "Completed") {
      return false;
    }

    const dueDate = new Date(`${task.due_date}T00:00:00`);

    dueDate.setHours(0, 0, 0, 0);

    return dueDate.getTime() === today.getTime();
  }).length;

  const overdueCount = tasks.filter((task) => {
    if (!task.due_date || task.status === "Completed") {
      return false;
    }

    const dueDate = new Date(`${task.due_date}T00:00:00`);

    dueDate.setHours(0, 0, 0, 0);

    return dueDate < today;
  }).length;

  const upcomingCount = tasks.filter((task) => {
    if (!task.due_date || task.status === "Completed") {
      return false;
    }

    const dueDate = new Date(`${task.due_date}T00:00:00`);

    dueDate.setHours(0, 0, 0, 0);

    return dueDate > today;
  }).length;

  const filteredTasks = tasks.filter((task) => {
    if (filter === "All") return true;

    if (filter === "Pending") {
      return task.status === "Pending";
    }

    if (filter === "In Progress") {
      return task.status === "In Progress";
    }

    if (filter === "Completed") {
      return task.status === "Completed";
    }

    if (!task.due_date) return false;

    const dueDate = new Date(`${task.due_date}T00:00:00`);

    dueDate.setHours(0, 0, 0, 0);

    if (filter === "Today") {
      return (
        dueDate.getTime() === today.getTime() && task.status !== "Completed"
      );
    }

    if (filter === "Overdue") {
      return dueDate < today && task.status !== "Completed";
    }

    if (filter === "Upcoming") {
      return dueDate > today && task.status !== "Completed";
    }

    return true;
  });

  function shareToWhatsApp() {
    const openTasks = tasks.filter((task) => task.status !== "Completed");

    let message = "🏨 Resort on Cedar – Tasks\n\n";

    const addTaskLine = (task: Task) => {
      const unit = getUnitLabel(task);

      message += `• ${task.title}`;

      if (unit) {
        message += ` (${unit})`;
      }

      message += ` – ${task.assigned_to || "Not assigned"}\n`;
    };

    const overdueTasks = openTasks.filter((task) => {
      if (!task.due_date) return false;

      const dueDate = new Date(`${task.due_date}T00:00:00`);

      dueDate.setHours(0, 0, 0, 0);

      return dueDate < today;
    });

    const todayTasks = openTasks.filter((task) => {
      if (!task.due_date) return false;

      const dueDate = new Date(`${task.due_date}T00:00:00`);

      dueDate.setHours(0, 0, 0, 0);

      return dueDate.getTime() === today.getTime();
    });

    const upcomingTasks = openTasks.filter((task) => {
      if (!task.due_date) return false;

      const dueDate = new Date(`${task.due_date}T00:00:00`);

      dueDate.setHours(0, 0, 0, 0);

      return dueDate > today;
    });

    if (overdueTasks.length > 0) {
      message += "🔴 OVERDUE\n";

      overdueTasks.forEach(addTaskLine);

      message += "\n";
    }

    if (todayTasks.length > 0) {
      message += "🟠 TODAY\n";

      todayTasks.forEach(addTaskLine);

      message += "\n";
    }

    if (upcomingTasks.length > 0) {
      message += "🟢 UPCOMING\n";

      upcomingTasks.forEach(addTaskLine);
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, "_blank");
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Could not sign out. Please try again.");
      return;
    }

    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Resort on Cedar
            </h1>

            <p className="text-gray-500">Task Board</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Log out
          </button>
        </div>

        {/* STATUS COUNTERS */}

        <div className="mb-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => setFilter("Pending")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-gray-900">{pendingCount}</p>

            <p className="text-xs text-gray-500">Pending</p>
          </button>

          <button
            onClick={() => setFilter("In Progress")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-gray-900">{inProgressCount}</p>

            <p className="text-xs text-gray-500">In Progress</p>
          </button>

          <button
            onClick={() => setFilter("Completed")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-gray-900">{completedCount}</p>

            <p className="text-xs text-gray-500">Completed</p>
          </button>
        </div>

        {/* DATE COUNTERS */}

        <div className="mb-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => setFilter("Today")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-orange-600">{todayCount}</p>

            <p className="text-xs text-gray-500">Today</p>
          </button>

          <button
            onClick={() => setFilter("Overdue")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-red-600">{overdueCount}</p>

            <p className="text-xs text-gray-500">Overdue</p>
          </button>

          <button
            onClick={() => setFilter("Upcoming")}
            className="rounded-xl bg-white p-3 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-green-600">{upcomingCount}</p>

            <p className="text-xs text-gray-500">Upcoming</p>
          </button>
        </div>

        {/* FILTERS */}

        <div className="mb-5 flex gap-2 overflow-x-auto">
          {["All", "Pending", "In Progress", "Completed"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
                filter === status
                  ? "bg-black text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* RECURRING TASKS */}

        <Link
          href="/recurring"
          className="mb-3 block w-full rounded-xl bg-white px-4 py-3 text-center font-semibold text-gray-900 shadow-sm"
        >
          🔁 Recurring Tasks
        </Link>

        {/* ADD TASK */}
        <Link
          href="/housekeeping"
          className="mb-3 block w-full rounded-xl bg-white px-4 py-3 text-center font-semibold text-gray-900 shadow-sm"
        >
          🧹 Housekeeping
        </Link>
          <Link
          href="/stock"
          className="mb-3 block w-full rounded-xl bg-white px-4 py-3 text-center font-semibold text-gray-900 shadow-sm"
        >
          🧺 Linen Stock
        </Link>
        {canEditTasks && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="mb-3 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
          >
            {showForm ? "Cancel" : "+ Add Task"}
          </button>
        )}

        {/* WHATSAPP */}

        <button
          onClick={shareToWhatsApp}
          className="mb-6 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
        >
          Share on WhatsApp
        </button>

        {/* ADD TASK FORM */}

        {showForm && (
          <form
            onSubmit={addTask}
            className="mb-6 space-y-4 rounded-xl bg-white p-4 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Task
              </label>

              <input
                type="text"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    title: e.target.value,
                  })
                }
                placeholder="e.g. Check air conditioner"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Area
              </label>

              <select
                value={newTask.area}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    area: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Select area</option>

                <option value="Maintenance">Maintenance</option>

                <option value="Housekeeping">Housekeeping</option>

                <option value="Reception">Reception</option>

                <option value="Pool / Common Areas">Pool / Common Areas</option>

                <option value="Administration">Administration</option>
              </select>
            </div>

            {/* UNITS */}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Applies to
              </label>

              <select
                value={newTask.unit_scope}
                onChange={(e) => {
                  const scope = e.target.value;

                  setNewTask({
                    ...newTask,
                    unit_scope: scope,
                  });

                  if (scope !== "selected") {
                    setSelectedUnitIds([]);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="none">No specific unit</option>

                <option value="selected">Specific unit(s)</option>

                <option value="all">All units</option>
              </select>
            </div>

            {newTask.unit_scope === "selected" && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Select unit(s)
                </p>

                <div className="grid grid-cols-5 gap-2">
                  {units.map((unit) => {
                    const selected = selectedUnitIds.includes(unit.id);

                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => toggleUnit(unit.id)}
                        className={`rounded-lg border py-2 text-sm font-semibold ${
                          selected
                            ? "border-black bg-black text-white"
                            : "border-gray-300 bg-white text-gray-700"
                        }`}
                      >
                        {unit.unit_number}
                      </button>
                    );
                  })}
                </div>

                {selectedUnitIds.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {selectedUnitIds.length} unit(s) selected
                  </p>
                )}
              </div>
            )}

            {newTask.unit_scope === "all" && (
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                This task applies to all 20 units.
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Priority
              </label>

              <select
                value={newTask.priority}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    priority: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="High">High</option>

                <option value="Medium">Medium</option>

                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assigned to
              </label>

              <input
                type="text"
                value={newTask.assigned_to}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    assigned_to: e.target.value,
                  })
                }
                placeholder="e.g. Maintenance"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Due date
              </label>

              <input
                type="date"
                value={newTask.due_date}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    due_date: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes
              </label>

              <textarea
                value={newTask.notes}
                onChange={(e) =>
                  setNewTask({
                    ...newTask,
                    notes: e.target.value,
                  })
                }
                placeholder="Optional notes"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
            >
              Create Task
            </button>
          </form>
        )}

        {/* LOADING */}

        {loading && <p className="text-gray-500">Loading tasks...</p>}

        {!loading && filteredTasks.length === 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="font-medium text-gray-800">No tasks found</p>

            <p className="mt-1 text-sm text-gray-500">
              There are no tasks for this filter.
            </p>
          </div>
        )}

        {/* TASK CARDS */}

        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const unitLabel = getUnitLabel(task);
            const completedUnitCount = task.unit_progress.filter(
              (item) => item.is_completed,
            ).length;
            const hasUnitProgress = task.unit_progress.length > 0;
            const isExpanded = expandedTaskId === task.id;

            return (
              <div key={task.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400">
                      {task.area || "General"}
                    </p>

                    <h2 className="mt-1 font-semibold text-gray-900">
                      {task.title}
                    </h2>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      task.priority === "High"
                        ? "bg-red-100 text-red-700"
                        : task.priority === "Medium"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>

                {/* UNIT */}

                {unitLabel && (
                  <div className="mt-3 inline-block rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                    🏠 {unitLabel}
                  </div>
                )}

                {hasUnitProgress && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                      <span>Unit progress</span>
                      <span>
                        {completedUnitCount} of {task.unit_progress.length}{" "}
                        completed
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-green-600 transition-all"
                        style={{
                          width: `${Math.round(
                            (completedUnitCount / task.unit_progress.length) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-1 text-sm text-gray-500">
                  <p>Assigned: {task.assigned_to || "Not assigned"}</p>

                  <p>Due: {formatDueDate(task.due_date)}</p>

                  {getDueStatus(task.due_date, task.status) === "overdue" && (
                    <p className="mt-2 inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                      🔴 OVERDUE
                    </p>
                  )}

                  {getDueStatus(task.due_date, task.status) === "today" && (
                    <p className="mt-2 inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                      🟠 DUE TODAY
                    </p>
                  )}

                  {getDueStatus(task.due_date, task.status) === "upcoming" && (
                    <p className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      🟢 UPCOMING
                    </p>
                  )}
                </div>

                {task.note_history.length === 0 && task.notes && (
                  <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    {task.notes}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setExpandedTaskId(isExpanded ? null : task.id);
                    setNewNote("");
                  }}
                  className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  {isExpanded ? "Hide details" : "View details & notes"}
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    {hasUnitProgress && (
                      <div>
                        <h3 className="font-semibold text-gray-900">Units</h3>

                        <div className="mt-3 space-y-2">
                          {task.unit_progress.map((item) => (
                            <label
                              key={item.unit_id}
                              className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm"
                            >
                              <input
                                type="checkbox"
                                checked={item.is_completed}
                                disabled={!canEditTasks}
                                onChange={() => toggleTaskUnit(task, item)}
                                className="mt-1 h-5 w-5"
                              />

                              <span className="flex-1">
                                <span className="block font-semibold text-gray-800">
                                  Unit {item.unit_number}
                                </span>

                                {item.is_completed && (
                                  <span className="mt-1 block text-xs text-green-700">
                                    Completed by{" "}
                                    {item.completed_by_name || "Unknown user"}
                                    {item.completed_at
                                      ? ` · ${new Date(item.completed_at).toLocaleString("en-AU")}`
                                      : ""}
                                  </span>
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Notes history
                      </h3>

                      {canEditTasks && (
                        <div className="mt-3">
                          <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add an update or note"
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                          />

                          <button
                            type="button"
                            disabled={savingNote || !newNote.trim()}
                            onClick={() => addTaskNote(task.id)}
                            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                          >
                            {savingNote ? "Saving..." : "Save note"}
                          </button>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {task.note_history.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            No notes have been added yet.
                          </p>
                        ) : (
                          task.note_history.map((note) => (
                            <div
                              key={note.id}
                              className="rounded-lg bg-white p-3 shadow-sm"
                            >
                              <p className="whitespace-pre-wrap text-sm text-gray-700">
                                {note.note}
                              </p>
                              <p className="mt-2 text-xs text-gray-500">
                                {note.created_by_name} ·{" "}
                                {new Date(note.created_at).toLocaleString(
                                  "en-AU",
                                )}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STATUS */}

                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Status</span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        task.status === "Completed"
                          ? "bg-green-100 text-green-800"
                          : task.status === "In Progress"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>

                  {!hasUnitProgress && task.status === "Pending" && (
                    <button
                      onClick={() => updateStatus(task.id, "In Progress")}
                      className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
                    >
                      Start Task
                    </button>
                  )}

                  {!hasUnitProgress && task.status === "In Progress" && (
                    <button
                      onClick={() => updateStatus(task.id, "Completed")}
                      className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
                    >
                      Mark as Completed
                    </button>
                  )}

                  {!hasUnitProgress && task.status === "Completed" && (
                    <>
                      <div className="rounded-xl bg-green-50 p-3 text-center font-medium text-green-700">
                        ✓ Completed
                      </div>

                      <button
                        onClick={() => updateStatus(task.id, "Pending")}
                        className="mt-2 w-full text-sm text-gray-500 underline"
                      >
                        Reopen task
                      </button>
                    </>
                  )}

                  {hasUnitProgress && task.status === "Completed" && (
                    <div className="rounded-xl bg-green-50 p-3 text-center font-medium text-green-700">
                      ✓ All units completed
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
