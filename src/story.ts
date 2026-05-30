import type { StoryActivity, StoryMap, StoryMapResult, StorySlice, StoryStep, StoryTask } from "./types";

export function parseStoryMap(source: string): StoryMapResult {
  const lines = source.split("\n");

  let user = "";
  let goal = "";
  const activities: StoryActivity[] = [];
  const slices: StorySlice[] = [];

  let currentActivity: StoryActivity | null = null;
  let currentStep: StoryStep | null = null;
  let currentSlice: StorySlice | null = null;

  let blockIndent = -1;
  let taskIndent = -1;

  const stepRegistry = new Map<string, StoryStep>();
  // Per-step task key sets for O(1) duplicate detection
  const stepTaskKeys = new Map<string, Set<string>>();
  let currentStepTaskKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      currentStep = null;
      blockIndent = -1;
      taskIndent = -1;
      currentStepTaskKeys = new Set<string>();

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
        if (!name) return { ok: false, error: `Line ${i + 1}: activity requires a name` };
        currentActivity = { name, steps: [] };
        currentSlice = null;
        activities.push(currentActivity);
      } else if (trimmed.startsWith("slice:")) {
        const name = trimmed.slice("slice:".length).trim();
        if (!name) return { ok: false, error: `Line ${i + 1}: "slice:" requires a name` };
        currentSlice = { name, cells: {} };
        currentActivity = null;
        slices.push(currentSlice);
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}"` };
      }

    } else if (currentActivity !== null && currentSlice === null) {
      if (blockIndent === -1) blockIndent = indent;

      if (indent === blockIndent) {
        if (!trimmed.startsWith("step:")) {
          return { ok: false, error: `Line ${i + 1}: expected "step: <name>" under activity — "${trimmed}"` };
        }
        const stepName = trimmed.slice("step:".length).trim();
        if (!stepName) return { ok: false, error: `Line ${i + 1}: step requires a name` };

        const stepKey = stepName.toLowerCase().trim();
        if (stepRegistry.has(stepKey)) {
          return { ok: false, error: `Line ${i + 1}: step "${stepName}" is defined more than once — step names must be unique` };
        }
        currentStep = { name: stepName, tasks: [] };
        currentActivity.steps.push(currentStep);
        stepRegistry.set(stepKey, currentStep);
        currentStepTaskKeys = new Set<string>();
        stepTaskKeys.set(stepKey, currentStepTaskKeys);
        taskIndent = -1;

      } else if (indent > blockIndent && currentStep !== null) {
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
        if (!taskName) return { ok: false, error: `Line ${i + 1}: task requires a name` };

        const taskKey = taskName.toLowerCase().trim();
        if (currentStepTaskKeys.has(taskKey)) {
          return { ok: false, error: `Line ${i + 1}: task "${taskName}" is defined more than once in step "${currentStep.name}"` };
        }
        currentStepTaskKeys.add(taskKey);

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
      if (!stepName) return { ok: false, error: `Line ${i + 1}: step reference requires a name` };

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

  // Drop slice references to renamed/missing steps or tasks.
  // Log a warning so typos are diagnosable without making this a hard error —
  // a renamed step shouldn't break the entire canvas.
  for (const slice of slices) {
    for (const stepKey of Object.keys(slice.cells)) {
      const validKeys = stepTaskKeys.get(stepKey);
      if (!validKeys) {
        console.warn(`Vizardry: slice "${slice.name}" references unknown step "${stepKey}" — ignored`);
        delete slice.cells[stepKey];
      } else {
        const dropped = slice.cells[stepKey].filter(k => !validKeys.has(k));
        if (dropped.length > 0) {
          console.warn(`Vizardry: slice "${slice.name}" / step "${stepKey}" references unknown tasks: ${dropped.join(", ")} — ignored`);
        }
        slice.cells[stepKey] = slice.cells[stepKey].filter(taskKey => validKeys.has(taskKey));
      }
    }
  }

  return { ok: true, data: { user, goal, activities, slices } };
}
