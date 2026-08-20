"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecurringTask = {
  id: number;
  title: string;
  area: string | null;
  priority: string;
  assigned_to: string | null;
  notes: string | null;
  frequency: string;
  interval_value: number;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  next_due_date: string;
  active: boolean;
};

export default function RecurringPage() {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [newRecurringTask, setNewRecurringTask] = useState({
    title: "",
    area: "",
    priority: "Medium",
    assigned_to: "",
    notes: "",
    frequency: "monthly",
    interval_value: 1,
    start_date: "",
  });

  useEffect(() => {
    async function getRecurringTasks() {
      const { data, error } = await supabase
        .from("recurring_tasks")
        .select("*")
        .order("next_due_date", { ascending: true });

      if (error) {
        console.error("Error loading recurring tasks:", error);
      } else {
        setRecurringTasks(data ?? []);
      }

      setLoading(false);
    }

    getRecurringTasks();
  }, []);

  async function addRecurringTask(e: React.FormEvent) {
    e.preventDefault();

    if (!newRecurringTask.title.trim()) {
      alert("Please enter a task title.");
      return;
    }

    if (!newRecurringTask.start_date) {
      alert("Please select a first due date.");
      return;
    }

    const startDate = new Date(
      `${newRecurringTask.start_date}T00:00:00`
    );

    const dayOfMonth =
      newRecurringTask.frequency === "monthly"
        ? startDate.getDate()
        : null;

    const dayOfWeek =
      newRecurringTask.frequency === "weekly"
        ? startDate.getDay()
        : null;

    const { data, error } = await supabase
      .from("recurring_tasks")
      .insert([
        {
          title: newRecurringTask.title,
          area: newRecurringTask.area || null,
          priority: newRecurringTask.priority,
          assigned_to: newRecurringTask.assigned_to || null,
          notes: newRecurringTask.notes || null,
          frequency: newRecurringTask.frequency,
          interval_value: newRecurringTask.interval_value,
          day_of_week: dayOfWeek,
          day_of_month: dayOfMonth,
          start_date: newRecurringTask.start_date,
          next_due_date: newRecurringTask.start_date,
          active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating recurring task:", error);
      alert("There was an error creating the recurring task.");
      return;
    }

    setRecurringTasks((current) =>
      [...current, data].sort(
        (a, b) =>
          new Date(a.next_due_date).getTime() -
          new Date(b.next_due_date).getTime()
      )
    );

    setNewRecurringTask({
      title: "",
      area: "",
      priority: "Medium",
      assigned_to: "",
      notes: "",
      frequency: "monthly",
      interval_value: 1,
      start_date: "",
    });

    setShowForm(false);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">

        <a
          href="/"
          className="mb-4 inline-block text-sm text-gray-500 underline"
        >
          ← Back to Task Board
        </a>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Recurring Tasks
          </h1>

          <p className="text-gray-500">
            Regular resort maintenance and operational tasks
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="mb-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ Add Recurring Task"}
        </button>

        {showForm && (
          <form
            onSubmit={addRecurringTask}
            className="mb-6 space-y-4 rounded-xl bg-white p-4 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Task
              </label>

              <input
                type="text"
                value={newRecurringTask.title}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
                    title: e.target.value,
                  })
                }
                placeholder="e.g. Clean air conditioner filters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Area
              </label>

              <select
                value={newRecurringTask.area}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
                    area: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Select area</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Reception">Reception</option>
                <option value="Pool / Common Areas">
                  Pool / Common Areas
                </option>
                <option value="Administration">
                  Administration
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Priority
              </label>

              <select
                value={newRecurringTask.priority}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
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
                value={newRecurringTask.assigned_to}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
                    assigned_to: e.target.value,
                  })
                }
                placeholder="e.g. Maintenance"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Frequency
                </label>

                <select
                  value={newRecurringTask.frequency}
                  onChange={(e) =>
                    setNewRecurringTask({
                      ...newRecurringTask,
                      frequency: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Every
                </label>

                <input
                  type="number"
                  min="1"
                  value={newRecurringTask.interval_value}
                  onChange={(e) =>
                    setNewRecurringTask({
                      ...newRecurringTask,
                      interval_value: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Example: Monthly + 3 means every 3 months.
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                First due date
              </label>

              <input
                type="date"
                value={newRecurringTask.start_date}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
                    start_date: e.target.value,
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
                value={newRecurringTask.notes}
                onChange={(e) =>
                  setNewRecurringTask({
                    ...newRecurringTask,
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
              Create Recurring Task
            </button>
          </form>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">
              {recurringTasks.filter((task) => task.active).length}
            </p>

            <p className="text-xs text-gray-500">
              Active
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">
              {recurringTasks.filter((task) => !task.active).length}
            </p>

            <p className="text-xs text-gray-500">
              Paused
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-gray-500">
            Loading recurring tasks...
          </p>
        )}

        {!loading && recurringTasks.length === 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="font-medium text-gray-800">
              No recurring tasks yet
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Create your first recurring task above.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {recurringTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
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
                    task.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {task.active ? "Active" : "Paused"}
                </span>
              </div>

              <div className="mt-4 space-y-1 text-sm text-gray-500">
                <p>
                  Frequency:{" "}
                  {task.frequency === "monthly"
                    ? task.interval_value === 1
                      ? "Monthly"
                      : `Every ${task.interval_value} months`
                    : task.frequency === "weekly"
                    ? task.interval_value === 1
                      ? "Weekly"
                      : `Every ${task.interval_value} weeks`
                    : task.frequency}
                </p>

                <p>
                  Next due:{" "}
                  {new Date(
                    `${task.next_due_date}T00:00:00`
                  ).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>

                <p>
                  Assigned: {task.assigned_to || "Not assigned"}
                </p>

                <p>
                  Priority: {task.priority}
                </p>
              </div>

              {task.notes && (
                <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  {task.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}