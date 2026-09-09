"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthGuard";

type Tab = "execution" | "setup";
type RunFilter = "open" | "completed";
type RunStatus = "Pending" | "In Progress" | "Completed";
type FrequencyPreset =
  "weekly" | "fortnightly" | "monthly" | "quarterly" | "six_monthly" | "yearly";

type RecurringTask = {
  id: number;
  title: string;
  area: string | null;
  priority: string;
  assigned_to: string | null;
  notes: string | null;
  frequency: "weekly" | "monthly";
  interval_value: number;
  start_date: string;
  next_due_date: string;
  active: boolean;
  created_by_name: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

type RecurringRun = {
  id: number;
  recurring_task_id: number;
  title: string;
  area: string | null;
  priority: string;
  assigned_to: string | null;
  notes: string | null;
  due_date: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  updated_by_name: string | null;
  completed_by_name: string | null;
};

type RunNote = {
  id: number;
  recurring_task_run_id: number;
  note: string;
  created_by_name: string | null;
  created_at: string;
};

type Profile = { id: string; full_name: string; role: string };
type Unit = { id: number; unit_number: number };
type TemplateAssignee = {
  recurring_task_id: number;
  user_id: string;
  user_name: string;
};
type TemplateUnit = {
  recurring_task_id: number;
  unit_id: number;
  unit_number: number;
};
type RunAssignee = {
  recurring_task_run_id: number;
  user_id: string;
  user_name: string;
};
type RunUnit = {
  recurring_task_run_id: number;
  unit_id: number;
  unit_number: number;
  completed: boolean;
  completed_by_name: string | null;
  completed_at: string | null;
};
type RecurringAttachment = {
  id: number;
  recurring_task_id: number | null;
  recurring_task_run_id: number | null;
  recurring_task_run_note_id: number | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by_name: string;
  created_at: string;
  signed_url: string;
};

const PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function validatePhotos(files: File[]) {
  const invalid = files.find(
    (file) => !PHOTO_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024,
  );
  if (invalid) {
    alert(`${invalid.name} must be an image no larger than 5 MB.`);
    return false;
  }
  return true;
}

type FormState = {
  title: string;
  area: string;
  priority: string;
  selected_user_ids: string[];
  selected_unit_ids: number[];
  notes: string;
  preset: FrequencyPreset;
  start_date: string;
};

const emptyForm: FormState = {
  title: "",
  area: "",
  priority: "Medium",
  selected_user_ids: [],
  selected_unit_ids: [],
  notes: "",
  preset: "monthly",
  start_date: "",
};

const areas = [
  "Maintenance",
  "Housekeeping",
  "Reception",
  "Pool / Common Areas",
  "Administration",
];

function presetToSchedule(preset: FrequencyPreset) {
  if (preset === "weekly") return { frequency: "weekly", interval_value: 1 };
  if (preset === "fortnightly")
    return { frequency: "weekly", interval_value: 2 };
  if (preset === "quarterly")
    return { frequency: "monthly", interval_value: 3 };
  if (preset === "six_monthly")
    return { frequency: "monthly", interval_value: 6 };
  if (preset === "yearly") return { frequency: "monthly", interval_value: 12 };
  return { frequency: "monthly", interval_value: 1 };
}

function scheduleToPreset(task: RecurringTask): FrequencyPreset {
  if (task.frequency === "weekly" && task.interval_value === 2)
    return "fortnightly";
  if (task.frequency === "weekly") return "weekly";
  if (task.interval_value === 3) return "quarterly";
  if (task.interval_value === 6) return "six_monthly";
  if (task.interval_value === 12) return "yearly";
  return "monthly";
}

function frequencyLabel(task: RecurringTask) {
  const labels: Record<FrequencyPreset, string> = {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    six_monthly: "Every 6 months",
    yearly: "Yearly",
  };
  return labels[scheduleToPreset(task)];
}

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

async function loadAllRows(
  table:
    | "recurring_task_runs"
    | "recurring_task_run_notes"
    | "recurring_task_assignees"
    | "recurring_task_units"
    | "recurring_task_run_assignees"
    | "recurring_task_run_units"
    | "recurring_task_attachments",
  orderColumn: string,
  ascending: boolean,
) {
  const pageSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderColumn, { ascending })
      .range(from, from + pageSize - 1);

    if (error) return { data: null, error };

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return { data: rows, error: null };
    from += pageSize;
  }
}

export default function RecurringPage() {
  const { user, userName, role, canEdit } = useAuth();
  const canEditRecurring = canEdit("recurring");
  const currentStaffName = userName?.trim() || "Unknown user";

  const [tab, setTab] = useState<Tab>("execution");
  const [runFilter, setRunFilter] = useState<RunFilter>("open");
  const [templates, setTemplates] = useState<RecurringTask[]>([]);
  const [runs, setRuns] = useState<RecurringRun[]>([]);
  const [notes, setNotes] = useState<RunNote[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [templateAssignees, setTemplateAssignees] = useState<
    TemplateAssignee[]
  >([]);
  const [templateUnits, setTemplateUnits] = useState<TemplateUnit[]>([]);
  const [runAssignees, setRunAssignees] = useState<RunAssignee[]>([]);
  const [runUnits, setRunUnits] = useState<RunUnit[]>([]);
  const [attachments, setAttachments] = useState<RecurringAttachment[]>([]);
  const [setupPhotos, setSetupPhotos] = useState<File[]>([]);
  const [runPhotos, setRunPhotos] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);

    const generationResult = await supabase.rpc("generate_due_recurring_runs");
    if (generationResult.error) {
      console.error("Error generating recurring runs:", generationResult.error);
    }

    const [
      templatesResult,
      runsResult,
      notesResult,
      profilesResult,
      unitsResult,
      templateAssigneesResult,
      templateUnitsResult,
      runAssigneesResult,
      runUnitsResult,
      attachmentsResult,
    ] = await Promise.all([
      supabase
        .from("recurring_tasks")
        .select("*")
        .order("next_due_date", { ascending: true }),
      loadAllRows("recurring_task_runs", "due_date", true),
      loadAllRows("recurring_task_run_notes", "created_at", false),
      supabase.rpc("get_assignable_recurring_users"),
      supabase.from("units").select("id, unit_number").order("unit_number"),
      loadAllRows("recurring_task_assignees", "recurring_task_id", true),
      loadAllRows("recurring_task_units", "recurring_task_id", true),
      loadAllRows(
        "recurring_task_run_assignees",
        "recurring_task_run_id",
        true,
      ),
      loadAllRows("recurring_task_run_units", "unit_number", true),
      loadAllRows("recurring_task_attachments", "created_at", false),
    ]);

    if (
      templatesResult.error ||
      runsResult.error ||
      notesResult.error ||
      templateAssigneesResult.error ||
      templateUnitsResult.error ||
      runAssigneesResult.error ||
      runUnitsResult.error ||
      attachmentsResult.error
    ) {
      console.error("Error loading recurring data:", {
        templates: templatesResult.error,
        runs: runsResult.error,
        notes: notesResult.error,
        templateAssignees: templateAssigneesResult.error,
        templateUnits: templateUnitsResult.error,
        runAssignees: runAssigneesResult.error,
        runUnits: runUnitsResult.error,
        attachments: attachmentsResult.error,
      });
      alert(
        "There was an error loading recurring users or units. Check the browser console for details.",
      );
    }

    setTemplates(
      (templatesResult.data ?? []).map((task) => ({
        ...task,
        id: Number(task.id),
        interval_value: Number(task.interval_value),
      })) as RecurringTask[],
    );

    setRuns(
      (runsResult.data ?? []).map((run) => ({
        ...run,
        id: Number(run.id),
        recurring_task_id: Number(run.recurring_task_id),
      })) as RecurringRun[],
    );

    setNotes(
      (notesResult.data ?? []).map((note) => ({
        ...note,
        id: Number(note.id),
        recurring_task_run_id: Number(note.recurring_task_run_id),
      })) as RunNote[],
    );

    if (profilesResult.error || unitsResult.error) {
      console.error("Error loading recurring selections:", {
        profiles: profilesResult.error,
        units: unitsResult.error,
      });
    }

    setProfiles((profilesResult.data ?? []) as Profile[]);
    setUnits(
      (unitsResult.data ?? []).map((unit) => ({
        id: Number(unit.id),
        unit_number: Number(unit.unit_number),
      })),
    );
    setTemplateAssignees(
      (templateAssigneesResult.data ?? []).map((item) => ({
        ...item,
        recurring_task_id: Number(item.recurring_task_id),
      })) as TemplateAssignee[],
    );
    setTemplateUnits(
      (templateUnitsResult.data ?? []).map((item) => ({
        ...item,
        recurring_task_id: Number(item.recurring_task_id),
        unit_id: Number(item.unit_id),
        unit_number: Number(item.unit_number),
      })) as TemplateUnit[],
    );
    setRunAssignees(
      (runAssigneesResult.data ?? []).map((item) => ({
        ...item,
        recurring_task_run_id: Number(item.recurring_task_run_id),
      })) as RunAssignee[],
    );
    setRunUnits(
      (runUnitsResult.data ?? []).map((item) => ({
        ...item,
        recurring_task_run_id: Number(item.recurring_task_run_id),
        unit_id: Number(item.unit_id),
        unit_number: Number(item.unit_number),
      })) as RunUnit[],
    );

    const attachmentRows = (attachmentsResult.data ?? []) as unknown as Omit<
      RecurringAttachment,
      "signed_url"
    >[];
    if (attachmentRows.length > 0) {
      const { data: signedRows, error: signedError } = await supabase.storage
        .from("task-photos")
        .createSignedUrls(
          attachmentRows.map((attachment) => attachment.storage_path),
          3600,
        );
      if (signedError)
        console.error("Error opening recurring photos:", signedError);
      setAttachments(
        attachmentRows.map((attachment, index) => ({
          ...attachment,
          id: Number(attachment.id),
          recurring_task_id: attachment.recurring_task_id
            ? Number(attachment.recurring_task_id)
            : null,
          recurring_task_run_id: attachment.recurring_task_run_id
            ? Number(attachment.recurring_task_run_id)
            : null,
          recurring_task_run_note_id: attachment.recurring_task_run_note_id
            ? Number(attachment.recurring_task_run_note_id)
            : null,
          signed_url: signedRows?.[index]?.signedUrl ?? "",
        })),
      );
    } else {
      setAttachments([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setSetupPhotos([]);
    setForm({ ...emptyForm, start_date: todayString() });
    setShowForm(true);
  }

  function openEditForm(task: RecurringTask) {
    setEditingId(task.id);
    setSetupPhotos([]);
    setForm({
      title: task.title,
      area: task.area ?? "",
      priority: task.priority,
      selected_user_ids: templateAssignees
        .filter((item) => item.recurring_task_id === task.id)
        .map((item) => item.user_id),
      selected_unit_ids: templateUnits
        .filter((item) => item.recurring_task_id === task.id)
        .map((item) => item.unit_id),
      notes: task.notes ?? "",
      preset: scheduleToPreset(task),
      start_date: task.next_due_date,
    });
    setShowForm(true);
  }

  async function uploadRecurringPhotos(
    files: File[],
    parent: { templateId?: number; runId?: number; runNoteId?: number | null },
  ) {
    if (!user || files.length === 0) return true;
    setUploadingPhotos(true);
    const parentFolder = parent.templateId
      ? `recurring-templates/${parent.templateId}`
      : `recurring-runs/${parent.runId}`;

    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `${parentFolder}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("task-photos")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        console.error("Error uploading recurring photo:", uploadError);
        alert(
          `The photo ${file.name} could not be uploaded: ${uploadError.message}`,
        );
        setUploadingPhotos(false);
        return false;
      }

      const { error: recordError } = await supabase
        .from("recurring_task_attachments")
        .insert({
          recurring_task_id: parent.templateId ?? null,
          recurring_task_run_id: parent.runId ?? null,
          recurring_task_run_note_id: parent.runNoteId ?? null,
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user.id,
          uploaded_by_name: currentStaffName,
        });

      if (recordError) {
        await supabase.storage.from("task-photos").remove([storagePath]);
        console.error("Error saving recurring photo:", recordError);
        alert(
          `The photo ${file.name} could not be saved: ${recordError.message}`,
        );
        setUploadingPhotos(false);
        return false;
      }
    }

    setUploadingPhotos(false);
    return true;
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditRecurring) return;

    if (!form.title.trim() || !form.start_date) {
      alert("Please enter a task name and next due date.");
      return;
    }

    const schedule = presetToSchedule(form.preset);
    const date = new Date(form.start_date + "T00:00:00");
    const selectedProfiles = profiles.filter((profile) =>
      form.selected_user_ids.includes(profile.id),
    );

    const payload = {
      title: form.title.trim(),
      area: form.area || null,
      priority: form.priority,
      assigned_to:
        selectedProfiles.map((profile) => profile.full_name).join(", ") || null,
      notes: form.notes.trim() || null,
      frequency: schedule.frequency,
      interval_value: schedule.interval_value,
      day_of_week: schedule.frequency === "weekly" ? date.getDay() : null,
      day_of_month: schedule.frequency === "monthly" ? date.getDate() : null,
      start_date: form.start_date,
      next_due_date: form.start_date,
      unit_scope: form.selected_unit_ids.length > 0 ? "selected" : "none",
      updated_at: new Date().toISOString(),
      updated_by_name: currentStaffName,
    };

    setSaving(true);

    const result =
      editingId === null
        ? await supabase
            .from("recurring_tasks")
            .insert([
              { ...payload, active: true, created_by_name: currentStaffName },
            ])
            .select("id")
            .single()
        : await supabase
            .from("recurring_tasks")
            .update(payload)
            .eq("id", editingId)
            .select("id")
            .single();

    if (result.error) {
      console.error("Error saving recurring template:", result.error);
      alert(
        "There was an error saving the recurring task: " + result.error.message,
      );
      setSaving(false);
      return;
    }

    const templateId = Number(result.data.id);
    const [removeAssignees, removeUnits] = await Promise.all([
      supabase
        .from("recurring_task_assignees")
        .delete()
        .eq("recurring_task_id", templateId),
      supabase
        .from("recurring_task_units")
        .delete()
        .eq("recurring_task_id", templateId),
    ]);

    if (removeAssignees.error || removeUnits.error) {
      console.error("Error replacing recurring selections:", {
        assignees: removeAssignees.error,
        units: removeUnits.error,
      });
      alert(
        "The activity was saved, but its users or units could not be updated.",
      );
      setSaving(false);
      return;
    }

    const associationResults = await Promise.all([
      selectedProfiles.length
        ? supabase.from("recurring_task_assignees").insert(
            selectedProfiles.map((profile) => ({
              recurring_task_id: templateId,
              user_id: profile.id,
              user_name: profile.full_name,
            })),
          )
        : Promise.resolve({ error: null }),
      form.selected_unit_ids.length
        ? supabase.from("recurring_task_units").insert(
            units
              .filter((unit) => form.selected_unit_ids.includes(unit.id))
              .map((unit) => ({
                recurring_task_id: templateId,
                unit_id: unit.id,
                unit_number: unit.unit_number,
              })),
          )
        : Promise.resolve({ error: null }),
    ]);

    setSaving(false);

    const associationError = associationResults.find(
      (item) => item.error,
    )?.error;
    if (associationError) {
      console.error("Error saving recurring selections:", associationError);
      alert(
        "The activity was saved, but its users or units could not be saved.",
      );
      return;
    }

    await uploadRecurringPhotos(setupPhotos, { templateId });

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSetupPhotos([]);
    await loadData();
  }

  async function toggleTemplate(task: RecurringTask) {
    if (!canEditRecurring) return;

    const { error } = await supabase
      .from("recurring_tasks")
      .update({
        active: !task.active,
        updated_at: new Date().toISOString(),
        updated_by_name: currentStaffName,
      })
      .eq("id", task.id);

    if (error) {
      alert("There was an error updating the recurring task: " + error.message);
      return;
    }

    await loadData();
  }

  async function deleteTemplate(task: RecurringTask) {
    if (role !== "admin") return;

    const confirmed = window.confirm(
      "Delete this recurring setup? Templates with execution history cannot be deleted.",
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("recurring_tasks")
      .delete()
      .eq("id", task.id);

    if (error) {
      alert(
        "This setup could not be deleted. Pause it instead if it already has history.",
      );
      return;
    }

    await loadData();
  }

  async function updateRunStatus(run: RecurringRun, status: RunStatus) {
    if (!canEditRecurring) return;

    // Older executions may have been generated before assignees and units
    // were added. Copy the current setup the first time they are worked on.
    if (status === "In Progress") {
      const currentRunUnits = runUnits.filter(
        (item) => item.recurring_task_run_id === run.id,
      );
      const currentRunAssignees = runAssignees.filter(
        (item) => item.recurring_task_run_id === run.id,
      );
      const setupUnits = templateUnits.filter(
        (item) => item.recurring_task_id === run.recurring_task_id,
      );
      const setupAssignees = templateAssignees.filter(
        (item) => item.recurring_task_id === run.recurring_task_id,
      );

      const copyResults = await Promise.all([
        currentRunUnits.length === 0 && setupUnits.length > 0
          ? supabase.from("recurring_task_run_units").upsert(
              setupUnits.map((item) => ({
                recurring_task_run_id: run.id,
                unit_id: item.unit_id,
                unit_number: item.unit_number,
              })),
              {
                onConflict: "recurring_task_run_id,unit_id",
                ignoreDuplicates: true,
              },
            )
          : Promise.resolve({ error: null }),
        currentRunAssignees.length === 0 && setupAssignees.length > 0
          ? supabase.from("recurring_task_run_assignees").upsert(
              setupAssignees.map((item) => ({
                recurring_task_run_id: run.id,
                user_id: item.user_id,
                user_name: item.user_name,
              })),
              {
                onConflict: "recurring_task_run_id,user_id",
                ignoreDuplicates: true,
              },
            )
          : Promise.resolve({ error: null }),
      ]);

      const copyError = copyResults.find((item) => item.error)?.error;
      if (copyError) {
        console.error("Error preparing overdue execution:", copyError);
        alert(
          "The execution could not load its users or units: " +
            copyError.message,
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("recurring_task_runs")
      .update({
        status,
        updated_at: now,
        updated_by_name: currentStaffName,
        completed_at: status === "Completed" ? now : null,
        completed_by_name: status === "Completed" ? currentStaffName : null,
      })
      .eq("id", run.id);

    if (error) {
      alert("There was an error updating the execution: " + error.message);
      return;
    }

    await loadData();
  }

  async function toggleRunUnit(item: RunUnit) {
    if (!canEditRecurring) return;

    const completed = !item.completed;
    const now = new Date().toISOString();
    const previousRunUnits = runUnits;
    const previousRuns = runs;
    const nextRunUnits = runUnits.map((runUnit) =>
      runUnit.recurring_task_run_id === item.recurring_task_run_id &&
      runUnit.unit_id === item.unit_id
        ? {
            ...runUnit,
            completed,
            completed_by_name: completed ? currentStaffName : null,
            completed_at: completed ? now : null,
          }
        : runUnit,
    );
    const unitsForThisRun = nextRunUnits.filter(
      (runUnit) => runUnit.recurring_task_run_id === item.recurring_task_run_id,
    );
    const allCompleted = unitsForThisRun.every((runUnit) => runUnit.completed);
    const anyCompleted = unitsForThisRun.some((runUnit) => runUnit.completed);
    const nextStatus: RunStatus = allCompleted
      ? "Completed"
      : anyCompleted
        ? "In Progress"
        : "Pending";

    // Update the screen immediately while Supabase saves in the background.
    setRunUnits(nextRunUnits);
    setRuns((current) =>
      current.map((run) =>
        run.id === item.recurring_task_run_id
          ? {
              ...run,
              status: nextStatus,
              updated_at: now,
              updated_by_name: currentStaffName,
              completed_at: allCompleted ? now : null,
              completed_by_name: allCompleted ? currentStaffName : null,
            }
          : run,
      ),
    );

    const { error } = await supabase
      .from("recurring_task_run_units")
      .update({
        completed,
        completed_by_name: completed ? currentStaffName : null,
        completed_at: completed ? now : null,
        updated_at: now,
      })
      .eq("recurring_task_run_id", item.recurring_task_run_id)
      .eq("unit_id", item.unit_id);

    if (error) {
      setRunUnits(previousRunUnits);
      setRuns(previousRuns);
      console.error("Error updating recurring unit:", error);
      alert(
        "There was an error updating Unit " +
          item.unit_number +
          ": " +
          error.message,
      );
    }
  }

  async function toggleRunDetails(run: RecurringRun, isOpen: boolean) {
    if (isOpen) {
      setOpenRunId(null);
      return;
    }

    const currentRunUnits = runUnits.filter(
      (item) => item.recurring_task_run_id === run.id,
    );
    const setupUnits = templateUnits.filter(
      (item) => item.recurring_task_id === run.recurring_task_id,
    );

    if (currentRunUnits.length === 0 && setupUnits.length > 0) {
      const { error } = await supabase.from("recurring_task_run_units").upsert(
        setupUnits.map((item) => ({
          recurring_task_run_id: run.id,
          unit_id: item.unit_id,
          unit_number: item.unit_number,
        })),
        {
          onConflict: "recurring_task_run_id,unit_id",
          ignoreDuplicates: true,
        },
      );

      if (error) {
        console.error("Error loading execution units:", error);
        alert("The units could not be loaded: " + error.message);
        return;
      }

      await loadData();
    }

    setOpenRunId(run.id);
  }

  async function addRunNote(runId: number) {
    if (!canEditRecurring || (!noteText.trim() && runPhotos.length === 0))
      return;

    let savedNote: RunNote | null = null;
    if (noteText.trim()) {
      const result = await supabase
        .from("recurring_task_run_notes")
        .insert([
          {
            recurring_task_run_id: runId,
            note: noteText.trim(),
            created_by_name: currentStaffName,
          },
        ])
        .select("*")
        .single();

      if (result.error) {
        alert("There was an error saving the note: " + result.error.message);
        return;
      }

      savedNote = {
        ...result.data,
        id: Number(result.data.id),
        recurring_task_run_id: Number(result.data.recurring_task_run_id),
      } as RunNote;
    }

    await uploadRecurringPhotos(runPhotos, {
      runId,
      runNoteId: savedNote?.id ?? null,
    });
    if (savedNote) setNotes((current) => [savedNote as RunNote, ...current]);
    setNoteText("");
    setRunPhotos([]);
    await loadData();
  }

  const visibleRuns = useMemo(() => {
    return runs.filter((run) =>
      runFilter === "completed"
        ? run.status === "Completed"
        : run.status !== "Completed",
    );
  }, [runs, runFilter]);

  const openCount = runs.filter((run) => run.status !== "Completed").length;
  const overdueCount = runs.filter(
    (run) => run.status !== "Completed" && run.due_date < todayString(),
  ).length;

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-md">
        <Link href="/" className="text-sm text-gray-500 underline">
          ← Back to Task Board
        </Link>

        <div className="mb-5 mt-4">
          <h1 className="text-2xl font-bold text-gray-900">Recurring Tasks</h1>
          <p className="text-gray-500">
            Scheduled resort operations and maintenance
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("execution")}
            className={
              "rounded-lg px-3 py-2 font-semibold " +
              (tab === "execution" ? "bg-black text-white" : "text-gray-600")
            }
          >
            Execution
          </button>
          <button
            type="button"
            onClick={() => setTab("setup")}
            className={
              "rounded-lg px-3 py-2 font-semibold " +
              (tab === "setup" ? "bg-black text-white" : "text-gray-600")
            }
          >
            Setup
          </button>
        </div>

        {loading && <p className="text-gray-500">Loading recurring tasks...</p>}

        {!loading && tab === "execution" && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4 text-center shadow-sm">
                <p className="text-2xl font-bold">{openCount}</p>
                <p className="text-xs text-gray-500">Open</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-red-700">
                  {overdueCount}
                </p>
                <p className="text-xs text-red-600">Overdue</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRunFilter("open")}
                className={
                  "rounded-lg px-3 py-2 text-sm font-semibold " +
                  (runFilter === "open"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600")
                }
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => setRunFilter("completed")}
                className={
                  "rounded-lg px-3 py-2 text-sm font-semibold " +
                  (runFilter === "completed"
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600")
                }
              >
                Completed
              </button>
            </div>

            {visibleRuns.length === 0 && (
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="font-medium text-gray-800">
                  No executions to show
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Due activities will be generated from active setups.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {visibleRuns.map((run) => {
                const isOpen = openRunId === run.id;
                const runNotes = notes.filter(
                  (note) => note.recurring_task_run_id === run.id,
                );
                const assignedUsers = runAssignees.filter(
                  (item) => item.recurring_task_run_id === run.id,
                );
                const assignedUnits = runUnits.filter(
                  (item) => item.recurring_task_run_id === run.id,
                );
                const runTaskPhotos = attachments.filter(
                  (photo) => photo.recurring_task_id === run.recurring_task_id,
                );
                const executionPhotos = attachments.filter(
                  (photo) => photo.recurring_task_run_id === run.id,
                );
                const overdue =
                  run.status !== "Completed" && run.due_date < todayString();

                return (
                  <article
                    key={run.id}
                    className="rounded-xl bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-gray-400">
                          {run.area || "General"}
                        </p>
                        <h2 className="mt-1 font-semibold text-gray-900">
                          {run.title}
                        </h2>
                      </div>
                      <span
                        className={
                          "rounded-full px-3 py-1 text-xs font-semibold " +
                          (run.status === "Completed"
                            ? "bg-green-100 text-green-700"
                            : overdue
                              ? "bg-red-100 text-red-700"
                              : run.status === "In Progress"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700")
                        }
                      >
                        {overdue ? `Overdue · ${run.status}` : run.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-500">
                      <p>Due: {formatDate(run.due_date)}</p>
                      <p>
                        Assigned:{" "}
                        {assignedUsers
                          .map((item) => item.user_name)
                          .join(", ") ||
                          run.assigned_to ||
                          "Not assigned"}
                      </p>
                      <p>Priority: {run.priority}</p>
                    </div>

                    {run.notes && (
                      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                        {run.notes}
                      </p>
                    )}

                    {canEditRecurring &&
                      assignedUnits.length === 0 &&
                      run.status !== "Completed" && (
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateRunStatus(run, "Pending")}
                            className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-xs font-semibold"
                          >
                            Pending
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRunStatus(run, "In Progress")}
                            className="flex-1 rounded-lg bg-orange-500 px-2 py-2 text-xs font-semibold text-white"
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRunStatus(run, "Completed")}
                            className="flex-1 rounded-lg bg-green-600 px-2 py-2 text-xs font-semibold text-white"
                          >
                            Complete
                          </button>
                        </div>
                      )}

                    <button
                      type="button"
                      onClick={() => toggleRunDetails(run, isOpen)}
                      className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                    >
                      {isOpen ? "Hide progress" : "Progress, notes & history"}
                    </button>

                    {isOpen && (
                      <div className="mt-4 border-t border-gray-200 pt-4">
                        {assignedUnits.length > 0 && (
                          <div className="mb-4 rounded-lg border border-gray-200 p-3">
                            <p className="mb-2 text-sm font-semibold text-gray-700">
                              Unit progress (
                              {
                                assignedUnits.filter((item) => item.completed)
                                  .length
                              }
                              /{assignedUnits.length})
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {assignedUnits.map((item) => (
                                <label
                                  key={item.unit_id}
                                  className={
                                    "flex items-start gap-2 rounded-lg border p-2 text-sm " +
                                    (item.completed
                                      ? "border-green-200 bg-green-50 text-green-800"
                                      : "border-gray-200 bg-white text-gray-700")
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={item.completed}
                                    disabled={!canEditRecurring}
                                    onChange={() => toggleRunUnit(item)}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <span>
                                    <span className="font-semibold">
                                      Unit {item.unit_number}
                                    </span>
                                    {item.completed && (
                                      <span className="mt-0.5 block text-xs text-green-700">
                                        {item.completed_by_name || "Completed"}
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

                        {canEditRecurring && (
                          <div>
                            <div className="flex gap-2">
                              <input
                                value={noteText}
                                onChange={(event) =>
                                  setNoteText(event.target.value)
                                }
                                placeholder="Add an update"
                                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
                              />
                              <button
                                type="button"
                                onClick={() => addRunNote(run.id)}
                                disabled={
                                  uploadingPhotos ||
                                  (!noteText.trim() && runPhotos.length === 0)
                                }
                                className="rounded-lg bg-black px-4 py-2 font-semibold text-white"
                              >
                                {uploadingPhotos ? "Saving..." : "Add"}
                              </button>
                            </div>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                              multiple
                              onChange={(event) => {
                                const files = Array.from(
                                  event.target.files ?? [],
                                );
                                if (validatePhotos(files)) setRunPhotos(files);
                              }}
                              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                            {runPhotos.length > 0 && (
                              <p className="mt-1 text-xs text-gray-500">
                                {runPhotos.length} photo(s) selected
                              </p>
                            )}
                          </div>
                        )}

                        {(runTaskPhotos.length > 0 ||
                          executionPhotos.length > 0) && (
                          <div className="mt-4">
                            <p className="mb-2 text-sm font-semibold text-gray-700">
                              Photos
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              {[...runTaskPhotos, ...executionPhotos].map(
                                (photo) => (
                                  <a
                                    key={photo.id}
                                    href={photo.signed_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="overflow-hidden rounded-lg bg-white shadow-sm"
                                  >
                                    {photo.signed_url &&
                                    photo.mime_type !== "image/heic" &&
                                    photo.mime_type !== "image/heif" ? (
                                      <img
                                        src={photo.signed_url}
                                        alt={photo.file_name}
                                        className="h-28 w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-28 items-center justify-center bg-gray-100 text-sm text-gray-500">
                                        Open photo
                                      </div>
                                    )}
                                    <div className="p-2 text-xs text-gray-500">
                                      <p className="truncate font-medium text-gray-700">
                                        {photo.file_name}
                                      </p>
                                      <p>
                                        {photo.uploaded_by_name} ·{" "}
                                        {new Date(
                                          photo.created_at,
                                        ).toLocaleString("en-AU")}
                                      </p>
                                    </div>
                                  </a>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          {runNotes.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No notes yet.
                            </p>
                          ) : (
                            runNotes.map((note) => (
                              <div
                                key={note.id}
                                className="rounded-lg bg-gray-50 p-3"
                              >
                                <p className="text-sm text-gray-700">
                                  {note.note}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {note.created_by_name || "Unknown user"} ·{" "}
                                  {new Date(note.created_at).toLocaleString(
                                    "en-AU",
                                  )}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}

        {!loading && tab === "setup" && (
          <>
            {canEditRecurring && editingId === null && (
              <button
                type="button"
                onClick={() =>
                  showForm ? setShowForm(false) : openCreateForm()
                }
                className="mb-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white"
              >
                {showForm ? "Cancel" : "+ Add Recurring Task"}
              </button>
            )}

            {showForm && editingId === null && (
              <form
                onSubmit={saveTemplate}
                className="mb-5 space-y-4 rounded-xl bg-white p-4 shadow-sm"
              >
                <h2 className="font-bold text-gray-900">
                  {editingId === null
                    ? "New recurring setup"
                    : "Edit recurring setup"}
                </h2>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Task
                  </label>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="e.g. Clean air conditioner filters"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Area
                  </label>
                  <select
                    value={form.area}
                    onChange={(event) =>
                      setForm({ ...form, area: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">Select area</option>
                    {areas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Priority
                    </label>
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        setForm({ ...form, priority: event.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Frequency
                    </label>
                    <select
                      value={form.preset}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          preset: event.target.value as FrequencyPreset,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="six_monthly">Every 6 months</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Assigned users
                  </label>
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                    {profiles.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.selected_user_ids.includes(profile.id)}
                          onChange={() =>
                            setForm({
                              ...form,
                              selected_user_ids:
                                form.selected_user_ids.includes(profile.id)
                                  ? form.selected_user_ids.filter(
                                      (id) => id !== profile.id,
                                    )
                                  : [...form.selected_user_ids, profile.id],
                            })
                          }
                        />
                        {profile.full_name}{" "}
                        <span className="text-xs text-gray-400">
                          ({profile.role})
                        </span>
                      </label>
                    ))}
                    {profiles.length === 0 && (
                      <p className="text-sm text-gray-500">
                        No users available.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Applicable units
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          selected_unit_ids:
                            form.selected_unit_ids.length === units.length
                              ? []
                              : units.map((unit) => unit.id),
                        })
                      }
                      className="text-xs font-semibold text-blue-600"
                    >
                      {form.selected_unit_ids.length === units.length
                        ? "Clear all"
                        : "Select all"}
                    </button>
                  </div>
                  <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                    {units.map((unit) => (
                      <label
                        key={unit.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.selected_unit_ids.includes(unit.id)}
                          onChange={() =>
                            setForm({
                              ...form,
                              selected_unit_ids:
                                form.selected_unit_ids.includes(unit.id)
                                  ? form.selected_unit_ids.filter(
                                      (id) => id !== unit.id,
                                    )
                                  : [...form.selected_unit_ids, unit.id],
                            })
                          }
                        />
                        Unit {unit.unit_number}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty when the activity does not apply to a unit.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {editingId === null ? "First due date" : "Next due date"}
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(event) =>
                      setForm({ ...form, start_date: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Instructions
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="Optional instructions"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Reference photos (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (validatePhotos(files)) setSetupPhotos(files);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                  {setupPhotos.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {setupPhotos.length} photo(s) selected
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingId === null
                      ? "Create setup"
                      : "Save changes"}
                </button>
              </form>
            )}

            {!canEditRecurring && (
              <div className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
                View only — you cannot change recurring setups.
              </div>
            )}

            <div className="space-y-3">
              {templates.map((task) => {
                const assignedUsers = templateAssignees.filter(
                  (item) => item.recurring_task_id === task.id,
                );
                const assignedUnits = templateUnits.filter(
                  (item) => item.recurring_task_id === task.id,
                );
                const templatePhotos = attachments.filter(
                  (photo) => photo.recurring_task_id === task.id,
                );

                return (
                  <article
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
                        className={
                          "rounded-full px-3 py-1 text-xs font-semibold " +
                          (task.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500")
                        }
                      >
                        {task.active ? "Active" : "Paused"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-500">
                      <p>Frequency: {frequencyLabel(task)}</p>
                      <p>Next due: {formatDate(task.next_due_date)}</p>
                      <p>
                        Assigned:{" "}
                        {assignedUsers
                          .map((item) => item.user_name)
                          .join(", ") ||
                          task.assigned_to ||
                          "Not assigned"}
                      </p>
                      <p>
                        Units:{" "}
                        {assignedUnits.length > 0
                          ? assignedUnits
                              .map((item) => item.unit_number)
                              .join(", ")
                          : "Not unit-specific"}
                      </p>
                      <p>Priority: {task.priority}</p>
                    </div>

                    {task.notes && (
                      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                        {task.notes}
                      </p>
                    )}

                    {templatePhotos.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {templatePhotos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="overflow-hidden rounded-lg border border-gray-200"
                          >
                            {photo.signed_url &&
                            photo.mime_type !== "image/heic" &&
                            photo.mime_type !== "image/heif" ? (
                              <img
                                src={photo.signed_url}
                                alt={photo.file_name}
                                className="h-24 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-24 items-center justify-center bg-gray-100 text-xs text-gray-500">
                                Open photo
                              </div>
                            )}
                          </a>
                        ))}
                      </div>
                    )}

                    {canEditRecurring && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(task)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleTemplate(task)}
                          className={
                            "rounded-lg px-3 py-2 text-sm font-semibold text-white " +
                            (task.active ? "bg-gray-600" : "bg-green-600")
                          }
                        >
                          {task.active ? "Pause" : "Reactivate"}
                        </button>
                      </div>
                    )}

                    {role === "admin" && (
                      <button
                        type="button"
                        onClick={() => deleteTemplate(task)}
                        className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600"
                      >
                        Delete setup
                      </button>
                    )}

                    {showForm && editingId === task.id && (
                      <form
                        onSubmit={saveTemplate}
                        className="mt-4 space-y-3 border-t border-gray-200 pt-4"
                      >
                        <h3 className="font-semibold text-gray-900">
                          Edit recurring setup
                        </h3>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Task
                          </label>
                          <input
                            value={form.title}
                            onChange={(event) =>
                              setForm({ ...form, title: event.target.value })
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              Area
                            </label>
                            <select
                              value={form.area}
                              onChange={(event) =>
                                setForm({ ...form, area: event.target.value })
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            >
                              <option value="">Select area</option>
                              {areas.map((area) => (
                                <option key={area} value={area}>
                                  {area}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              Priority
                            </label>
                            <select
                              value={form.priority}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  priority: event.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            >
                              <option>High</option>
                              <option>Medium</option>
                              <option>Low</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              Frequency
                            </label>
                            <select
                              value={form.preset}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  preset: event.target.value as FrequencyPreset,
                                })
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            >
                              <option value="weekly">Weekly</option>
                              <option value="fortnightly">Fortnightly</option>
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="six_monthly">
                                Every 6 months
                              </option>
                              <option value="yearly">Yearly</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              Next due date
                            </label>
                            <input
                              type="date"
                              value={form.start_date}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  start_date: event.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Assigned users
                          </label>
                          <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                            {profiles.map((profile) => (
                              <label
                                key={profile.id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.selected_user_ids.includes(
                                    profile.id,
                                  )}
                                  onChange={() =>
                                    setForm({
                                      ...form,
                                      selected_user_ids:
                                        form.selected_user_ids.includes(
                                          profile.id,
                                        )
                                          ? form.selected_user_ids.filter(
                                              (id) => id !== profile.id,
                                            )
                                          : [
                                              ...form.selected_user_ids,
                                              profile.id,
                                            ],
                                    })
                                  }
                                />
                                {profile.full_name}{" "}
                                <span className="text-xs text-gray-400">
                                  ({profile.role})
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">
                              Applicable units
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  selected_unit_ids:
                                    form.selected_unit_ids.length ===
                                    units.length
                                      ? []
                                      : units.map((unit) => unit.id),
                                })
                              }
                              className="text-xs font-semibold text-blue-600"
                            >
                              {form.selected_unit_ids.length === units.length
                                ? "Clear all"
                                : "Select all"}
                            </button>
                          </div>
                          <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                            {units.map((unit) => (
                              <label
                                key={unit.id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.selected_unit_ids.includes(
                                    unit.id,
                                  )}
                                  onChange={() =>
                                    setForm({
                                      ...form,
                                      selected_unit_ids:
                                        form.selected_unit_ids.includes(unit.id)
                                          ? form.selected_unit_ids.filter(
                                              (id) => id !== unit.id,
                                            )
                                          : [
                                              ...form.selected_unit_ids,
                                              unit.id,
                                            ],
                                    })
                                  }
                                />
                                Unit {unit.unit_number}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Instructions
                          </label>
                          <textarea
                            value={form.notes}
                            onChange={(event) =>
                              setForm({ ...form, notes: event.target.value })
                            }
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Add reference photos (optional)
                          </label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                            multiple
                            onChange={(event) => {
                              const files = Array.from(
                                event.target.files ?? [],
                              );
                              if (validatePhotos(files)) setSetupPhotos(files);
                            }}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          {setupPhotos.length > 0 && (
                            <p className="mt-1 text-xs text-gray-500">
                              {setupPhotos.length} photo(s) selected
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowForm(false);
                              setEditingId(null);
                              setForm(emptyForm);
                            }}
                            className="rounded-lg border border-gray-300 px-3 py-2 font-semibold text-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-lg bg-green-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save changes"}
                          </button>
                        </div>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
