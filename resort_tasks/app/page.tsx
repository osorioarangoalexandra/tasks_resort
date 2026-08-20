"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: number;
  title: string;
  area: string | null;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("All");

  const [newTask, setNewTask] = useState({
    title: "",
    area: "",
    priority: "Medium",
    assigned_to: "",
    due_date: "",
    notes: "",
  });

  useEffect(() => {
    async function getTasks() {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading tasks:", error);
      } else {
        setTasks(data ?? []);
      }

      setLoading(false);
    }

    getTasks();
  }, []);

  async function updateStatus(id: number, newStatus: string) {
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
    return;
  }

  setTasks((currentTasks) =>
    currentTasks.map((task) =>
      task.id === id
        ? { ...task, status: newStatus }
        : task
    )
  );
}
async function addTask(e: React.FormEvent) {
  e.preventDefault();

  if (!newTask.title.trim()) {
    alert("Please enter a task title.");
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
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating task:", error);
    alert("There was an error creating the task.");
    return;
  }

  setTasks((currentTasks) => [data, ...currentTasks]);

  setNewTask({
    title: "",
    area: "",
    priority: "Medium",
    assigned_to: "",
    due_date: "",
    notes: "",
  });

  setShowForm(false);
}

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
const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pendingCount = tasks.filter(
  (task) => task.status === "Pending"
).length;

const inProgressCount = tasks.filter(
  (task) => task.status === "In Progress"
).length;

const completedCount = tasks.filter(
  (task) => task.status === "Completed"
).length;

const todayCount = tasks.filter((task) => {
  if (!task.due_date || task.status === "Completed") return false;

  const dueDate = new Date(`${task.due_date}T00:00:00`);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate.getTime() === today.getTime();
}).length;

const overdueCount = tasks.filter((task) => {
  if (!task.due_date || task.status === "Completed") return false;

  const dueDate = new Date(`${task.due_date}T00:00:00`);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}).length;

const upcomingCount = tasks.filter((task) => {
  if (!task.due_date || task.status === "Completed") return false;

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
      dueDate.getTime() === today.getTime() &&
      task.status !== "Completed"
    );
  }

  if (filter === "Overdue") {
    return (
      dueDate < today &&
      task.status !== "Completed"
    );
  }

  if (filter === "Upcoming") {
    return (
      dueDate > today &&
      task.status !== "Completed"
    );
  }

  return true;
});

function shareToWhatsApp() {
  const openTasks = tasks.filter(
    (task) => task.status !== "Completed"
  );

  let message = "🏨 Resort on Cedar – Tasks\n\n";

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

    overdueTasks.forEach((task) => {
      message += `• ${task.title} – ${
        task.assigned_to || "Not assigned"
      }\n`;
    });

    message += "\n";
  }

  if (todayTasks.length > 0) {
    message += "🟠 TODAY\n";

    todayTasks.forEach((task) => {
      message += `• ${task.title} – ${
        task.assigned_to || "Not assigned"
      }\n`;
    });

    message += "\n";
  }

  if (upcomingTasks.length > 0) {
    message += "🟢 UPCOMING\n";

    upcomingTasks.forEach((task) => {
      message += `• ${task.title} – ${
        task.assigned_to || "Not assigned"
      }\n`;
    });
  }

  const whatsappUrl =
    `https://wa.me/?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, "_blank");
    }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-gray-900">
          Resort on Cedar
        </h1>

        <p className="mb-6 text-gray-500">
          Task Board
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-gray-900">
                  {pendingCount}
                </p>
                <p className="text-xs text-gray-500">
                  Pending
                </p>
              </div>

              <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-gray-900">
                  {inProgressCount}
                </p>
                <p className="text-xs text-gray-500">
                  In Progress
                </p>
              </div>

          <div className="rounded-xl bg-white p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-gray-900">
              {completedCount}
            </p>
            <p className="text-xs text-gray-500">
              Completed
            </p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
  <button
    onClick={() => setFilter("Today")}
    className="rounded-xl bg-white p-3 text-center shadow-sm"
  >
    <p className="text-xl font-bold text-gray-900">
      {todayCount}
    </p>
    <p className="text-xs text-gray-500">
      Today
    </p>
  </button>

  <button
    onClick={() => setFilter("Overdue")}
    className="rounded-xl bg-white p-3 text-center shadow-sm"
  >
    <p className="text-xl font-bold text-red-600">
      {overdueCount}
    </p>
    <p className="text-xs text-gray-500">
      Overdue
    </p>
  </button>

  <button
    onClick={() => setFilter("Upcoming")}
    className="rounded-xl bg-white p-3 text-center shadow-sm"
  >
    <p className="text-xl font-bold text-gray-900">
      {upcomingCount}
    </p>
    <p className="text-xs text-gray-500">
      Upcoming
    </p>
  </button>
</div>

        <div className="mb-6 flex gap-2 overflow-x-auto">
  {["All", "Pending", "In Progress", "Completed"].map(
    (status) => (
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
    )
  )}
</div>


        <button
            onClick={() => setShowForm(!showForm)}
            className="mb-6 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
          >
            {showForm ? "Cancel" : "+ Add Task"}
          </button>
        <button
            onClick={shareToWhatsApp}
            className="mb-6 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
          >
            Share on WhatsApp
          </button>
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
        placeholder="e.g. Check pool glass panels"
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
        {loading && (
          <p className="text-gray-500">
            Loading tasks...
          </p>
        )}

        {!loading && tasks.length === 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="font-medium text-gray-800">
              No tasks yet
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Add a task in Supabase to test the connection.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400">
                    {task.area || "General"}
                  </p>

                  <h2 className="mt-1 font-semibold text-gray-900">
                    {task.title}
                  </h2>
                </div>

                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {task.priority}
                </span>
              </div>

              <div className="mt-4 space-y-1 text-sm text-gray-500">
                <p>
                  Assigned: {task.assigned_to || "Not assigned"}
                </p>

                <p>
                  Due:{" "}
                  {task.due_date
                    ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString(
                        "en-AU",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }
                      )
                    : "No due date"}
                </p>
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

              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Status
                  </span>

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

                {task.status === "Pending" && (
                  <button
                    onClick={() => updateStatus(task.id, "In Progress")}
                    className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
                  >
                    Start Task
                  </button>
                )}

                {task.status === "In Progress" && (
                  <button
                    onClick={() => updateStatus(task.id, "Completed")}
                    className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
                  >
                    Mark as Completed
                  </button>
                )}

               

                {task.status === "Completed" && (
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );

  
}