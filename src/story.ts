import { StoryMap, StoryMapResult } from "./types";

/**
 * Parses the User Story Map syntax:
 *
 *   user: Persona description
 *   goal: What they want to achieve
 *
 *   activity: Activity Name
 *     step: Step Name
 *       task: Task Name
 *       task: Task Name | optional subtitle
 *
 *   slice: Priority Band
 *     step: Step Name | Task Name, Task Name
 *
 * Rules:
 * - `user:` and `goal:` are optional one-line metadata shown in the header
 * - Each `activity: <name>` defines a backbone column group
 * - Each `step: <name>` (indented under an activity) defines a column;
 *   step names must be unique across the whole document
 * - Each `task: <name>` (indented under a step) defines a card;
 *   an optional subtitle is separated by `|`; task names must be unique within their parent step
 * - Each `slice: <name>` defines a priority band
 * - Under a slice, `step: <name> | task A, task B` assigns tasks to that band
 * - Tasks not assigned to any slice appear in a catch-all Backlog band
 */
export function parseStoryMap(source: string): StoryMapResult {
  const lines = source.split("\n");

  let user = "";
  let goal = "";
  const activities: { name: string; steps: { name: string; tasks: { name: string; subtitle: string }[] }[] }[] = [];
  const slices: { name: string; cells: Record<string, string[]> }[] = [];

  let currentActivity: typeof activities[number] | null = null;
  let currentStep: typeof activities[number]["steps"][number] | null = null;
  let currentSlice: typeof slices[number] | null = null;

  let blockIndent = -1;
  let taskIndent = -1;

  const stepRegistry = new Map<string, typeof activities[number]["steps"][number]>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      currentStep = null;
      blockIndent = -1;
      taskIndent = -1;

      if (trimmed.startsWith("user:")) {
        user = trimmed.slice("user:".length).trim();
        currentActivity = null;
        currentSlice = null;
      } else if (trimmed.startsWith("goal:")) {
        goal = trimmed.slice("goal:".length).trim();
        currentActivity = null;
        currentSlice = null;
      } else if (trimmed.startsWith("activity:")) {
        const name = trimmed.slice("activity:".length).trim();
        if (!name) {
          return { ok: false, error: `Line ${i + 1}: activity requires a name` };
        }
        currentActivity = { name, steps: [] };
        currentSlice = null;
        activities.push(currentActivity);
      } else if (trimmed.startsWith("slice:")) {
        const name = trimmed.slice("slice:".length).trim();
        if (!name) {
          return { ok: false, error: `Line ${i + 1}: "slice:" requires a name` };
        }
        currentSlice = { name, cells: {} };
        currentActivity = null;
        slices.push(currentSlice);
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}"` };
      }

    } else if (currentActivity !== null && currentSlice === null) {
      if (blockIndent === -1) blockIndent = indent;

      if (indent === blockIndent) {
        // Step declaration
        if (!trimmed.startsWith("step:")) {
          return { ok: false, error: `Line ${i + 1}: expected "step: <name>" under activity — "${trimmed}"` };
        }
        const stepName = trimmed.slice("step:".length).trim();
        if (!stepName) {
          return { ok: false, error: `Line ${i + 1}: step requires a name` };
        }
        const stepKey = stepName.toLowerCase().trim();
        if (stepRegistry.has(stepKey)) {
          return { ok: false, error: `Line ${i + 1}: step "${stepName}" is defined more than once — step names must be unique` };
        }
        currentStep = { name: stepName, tasks: [] };
        currentActivity.steps.push(currentStep);
        stepRegistry.set(stepKey, currentStep);
        taskIndent = -1;

      } else if (indent > blockIndent && currentStep !== null) {
        // Task declaration
        if (taskIndent === -1) taskIndent = indent;
        if (indent !== taskIndent) {
          return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
        }
        if (!trimmed.startsWith("task:")) {
          return { ok: false, error: `Line ${i + 1}: expected "task: <name>" — "${trimmed}"` };
        }
        const rest = trimmed.slice("task:".length).trim();
        const pipeIdx = rest.indexOf("|");
        const taskName = pipeIdx === -1 ? rest : rest.slice(0, pipeIdx).trim();
        if (!taskName) {
          return { ok: false, error: `Line ${i + 1}: task requires a name` };
        }
        const taskKey = taskName.toLowerCase().trim();
        if (currentStep.tasks.some(t => t.name.toLowerCase().trim() === taskKey)) {
          return { ok: false, error: `Line ${i + 1}: task "${taskName}" is defined more than once in step "${currentStep.name}"` };
        }
        const subtitle = pipeIdx === -1 ? "" : rest.slice(pipeIdx + 1).trim();
        currentStep.tasks.push({ name: taskName, subtitle });

      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
      }

    } else if (currentSlice !== null && currentActivity === null) {
      if (blockIndent === -1) blockIndent = indent;
      if (indent !== blockIndent) {
        return { ok: false, error: `Line ${i + 1}: unexpected indentation in slice — "${trimmed}"` };
      }
      if (!trimmed.startsWith("step:")) {
        return { ok: false, error: `Line ${i + 1}: expected "step: <name> | task, task" — "${trimmed}"` };
      }
      const rest = trimmed.slice("step:".length).trim();
      const pipeIdx = rest.indexOf("|");
      const stepName = pipeIdx === -1 ? rest : rest.slice(0, pipeIdx).trim();
      if (!stepName) {
        return { ok: false, error: `Line ${i + 1}: step reference requires a name` };
      }
      const taskList = pipeIdx === -1 ? "" : rest.slice(pipeIdx + 1).trim();
      if (taskList) {
        const stepKey = stepName.toLowerCase().trim();
        const taskKeys = taskList.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
        currentSlice.cells[stepKey] = taskKeys;
      }

    } else {
      return { ok: false, error: `Line ${i + 1}: indented content outside an activity or slice` };
    }
  }

  if (activities.length === 0) {
    return { ok: false, error: 'At least one "activity:" is required' };
  }

  for (const activity of activities) {
    if (activity.steps.length === 0) {
      return { ok: false, error: `Activity "${activity.name}" has no steps` };
    }
  }

  // Silently drop slice references to renamed/missing steps or tasks
  for (const slice of slices) {
    for (const stepKey of Object.keys(slice.cells)) {
      const step = stepRegistry.get(stepKey);
      if (!step) {
        delete slice.cells[stepKey];
        continue;
      }
      slice.cells[stepKey] = slice.cells[stepKey].filter(taskKey =>
        step.tasks.some(t => t.name.toLowerCase().trim() === taskKey)
      );
    }
  }

  return { ok: true, data: { user, goal, activities, slices } as StoryMap };
}
