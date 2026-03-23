import type { StackModel } from "@otavia/stack";

/** Stack package dir + each resolved cell package dir (deduped, declaration order preserved for cells). */
export function collectStackAndCellDirs(stackRoot: string, model: StackModel): string[] {
  const out: string[] = [stackRoot];
  const seen = new Set<string>([stackRoot]);
  for (const mount of model.cellMountOrder) {
    const cell = model.cells[mount];
    if (!cell) continue;
    const d = cell.packageRootAbs;
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}
