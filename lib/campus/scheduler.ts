import { z } from "zod";
import { campusFor, campusIds, distanceMetres, type Point } from "./geography.ts";

const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record ID.");
const text = (max: number) => z.string().trim().min(1).max(max);
export const teachingTypes = ["lecture_room", "laboratory", "seminar_room"] as const;
export const scheduleInput = z.object({
  academicYear: text(30), semester: text(30),
  demands: z.array(z.object({
    course: id, department: id, cohort: text(100), lecturer: text(120),
    campus: z.enum(campusIds), classSize: z.number().int().min(1).max(10000),
    weeklySessions: z.number().int().min(1).max(5),
    durationMinutes: z.number().int().min(30).max(240).multipleOf(30),
    roomType: z.enum(teachingTypes),
    equipment: z.array(text(100)).max(20),
  }).strict()).min(1).max(40),
}).strict().superRefine((value, ctx) => {
  if (value.demands.reduce((sum, demand) => sum + demand.weeklySessions, 0) > 80) ctx.addIssue({ code: "custom", message: "Allocate at most 80 weekly sessions per batch." });
  const identities = new Set<string>();
  for (const demand of value.demands) {
    const identity = `${demand.course}:${demand.department}:${normalise(demand.cohort)}`;
    if (identities.has(identity)) ctx.addIssue({ code: "custom", message: "Combine repeated course/cohort requirements into one demand." });
    identities.add(identity);
  }
});
export type ScheduleInput = z.infer<typeof scheduleInput>;
export type TeachingRoom = {
  id: string; code: string; name: string; capacity: number; spaceType: string; isAvailable: boolean;
  equipment: string[]; point: Point | null;
};
export type Allocation = {
  id?: string; course: string; department: string; room: string; cohort: string; lecturer: string;
  academicYear: string; semester: string; dayOfWeek: number; startTime: string; endTime: string;
  classSize?: number; requiredEquipment?: string[]; roomType?: string;
};
export type ReservedSlot = { room: string; dayOfWeek: number; startTime: string; endTime: string };
export type PlannedAllocation = Allocation & { demandIndex: number; sessionNumber: number; classSize: number; requiredEquipment: string[]; roomType: string };
export type ScheduleResult = {
  allocations: PlannedAllocation[];
  unscheduled: { demandIndex: number; sessionNumber: number; reason: string }[];
  warnings: string[];
  metrics: { requested: number; scheduled: number; estimatedWalkingMinutes: number; roomUtilisationPercent: number; searchLimited: boolean; candidateEvaluations: number };
};
export const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const clock = (value: number) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

export function travelMinutes(a: TeachingRoom, b: TeachingRoom): number | null {
  if (a.id === b.id) return 5;
  if (!a.point || !b.point || !campusFor(a.point) || !campusFor(b.point)) return null;
  // Conservative walking estimate: 1.4x straight-line distance at 1.2 m/s, plus five minutes.
  return Math.ceil(distanceMetres(a.point, b.point) * 1.4 / 72) + 5;
}
function samePeople(a: Allocation, b: Allocation): boolean {
  // Terms do not have date ranges yet: treat all current allocations as potentially concurrent.
  return (a.department === b.department && normalise(a.cohort) === normalise(b.cohort)) ||
    normalise(a.lecturer) === normalise(b.lecturer);
}
export function allocationConflict(candidate: Allocation, existing: Allocation[], rooms: TeachingRoom[], bookings: ReservedSlot[] = []): string | null {
  const room = rooms.find((room) => room.id === candidate.room);
  if (!room || !room.isAvailable || !teachingTypes.some((type) => type === room.spaceType)) return "Choose an available lecture, seminar or laboratory room.";
  if (!room.point || !campusFor(room.point)) return "Room location is outside the supported navigation scopes: verify its coordinates.";
  if ((candidate.classSize ?? 0) > room.capacity) return "Class size exceeds room capacity.";
  if (candidate.roomType && candidate.roomType !== room.spaceType) return "Room type does not match the teaching requirement.";
  const equipment = new Set(room.equipment.map(normalise));
  if (candidate.requiredEquipment?.some((item) => !equipment.has(normalise(item)))) return "Room is missing required teaching equipment.";
  const start = minutes(candidate.startTime), end = minutes(candidate.endTime);
  if (start >= end || start < 420 || end > 1260) return "Teaching must be between 07:00 and 21:00 on one day.";
  for (const other of existing) {
    if ((candidate.id && candidate.id === other.id) || candidate.dayOfWeek !== other.dayOfWeek) continue;
    const people = samePeople(candidate, other);
    const otherStart = minutes(other.startTime), otherEnd = minutes(other.endTime);
    if ((people || candidate.room === other.room) && start < otherEnd && end > otherStart) return "Room, cohort or lecturer overlaps another allocation.";
    if (people) {
      const otherRoom = rooms.find((room) => room.id === other.room);
      const travel = otherRoom ? travelMinutes(room, otherRoom) : null;
      if (travel === null) return "Travel cannot be checked: verify campus coordinates for both rooms.";
      const gap = start >= otherEnd ? start - otherEnd : otherStart - end;
      if (gap < travel) return `Insufficient cohort/lecturer transfer time: need ${travel} minutes between ${room.code} and ${otherRoom?.code}.`;
    }
  }
  if (bookings.some((booking) => booking.room === candidate.room && booking.dayOfWeek === candidate.dayOfWeek &&
    start < minutes(booking.endTime) && end > minutes(booking.startTime))) return "Room has a pending or confirmed student booking.";
  return null;
}

export function generateSchedule(input: ScheduleInput, rooms: TeachingRoom[], existing: Allocation[], bookings: ReservedSlot[]): ScheduleResult {
  const eligible = input.demands.map((demand) => rooms.filter((room) => room.isAvailable && room.spaceType === demand.roomType &&
    room.capacity >= demand.classSize && room.point && campusFor(room.point)?.id === demand.campus &&
    demand.equipment.every((item) => room.equipment.map(normalise).includes(normalise(item))))
    .sort((a, b) => a.capacity - b.capacity || a.code.localeCompare(b.code)));
  const tasks = input.demands.flatMap((demand, demandIndex) => Array.from({ length: demand.weeklySessions }, (_, i) => ({ demandIndex, sessionNumber: i + 1 })))
    .sort((a, b) => eligible[a.demandIndex].length - eligible[b.demandIndex].length ||
      input.demands[b.demandIndex].durationMinutes - input.demands[a.demandIndex].durationMinutes ||
      input.demands[b.demandIndex].classSize - input.demands[a.demandIndex].classSize ||
      a.demandIndex - b.demandIndex || a.sessionNumber - b.sessionNumber);
  type State = { rows: PlannedAllocation[]; missed: ScheduleResult["unscheduled"]; score: number };
  let states: State[] = [{ rows: [], missed: [], score: 0 }];
  let evaluations = 0, searchLimited = false;
  const MAX_EVALUATIONS = 500000;
  for (const task of tasks) {
    const demand = input.demands[task.demandIndex];
    const next: State[] = [];
    for (const state of states) {
      const occupied = [...existing, ...state.rows];
      const candidates: { row: PlannedAllocation; score: number }[] = [];
      let lastReason = "No available slot satisfies the room, people, travel and booking constraints.";
      const usedDays = new Set(occupied.filter((row) => row.course === demand.course && row.department === demand.department &&
        normalise(row.cohort) === normalise(demand.cohort)).map((row) => row.dayOfWeek));
      for (let day = 1; day <= 5; day++) {
        if (usedDays.has(day)) continue;
        for (let start = 480; start + demand.durationMinutes <= 1020; start += 30) {
          const end = start + demand.durationMinutes;
          if (start < 780 && end > 720) continue;
          for (const room of eligible[task.demandIndex]) {
            if (evaluations >= MAX_EVALUATIONS) { searchLimited = true; break; }
            evaluations++;
            const row: PlannedAllocation = {
              ...task, academicYear: input.academicYear, semester: input.semester,
              department: demand.department, course: demand.course, cohort: demand.cohort, lecturer: demand.lecturer,
              room: room.id, dayOfWeek: day, startTime: clock(start), endTime: clock(end),
              classSize: demand.classSize, requiredEquipment: demand.equipment, roomType: demand.roomType,
            };
            const conflict = allocationConflict(row, occupied, rooms, bookings);
            if (conflict) { lastReason = conflict; continue; }
            const neighbours = occupied.filter((other) => other.dayOfWeek === day && samePeople(row, other));
            const travelCost = neighbours.reduce((sum, other) => {
              const otherRoom = rooms.find((room) => room.id === other.room);
              return sum + (otherRoom ? travelMinutes(room, otherRoom) ?? 0 : 0);
            }, 0);
            const dailyLoad = neighbours.reduce((sum, other) => sum + minutes(other.endTime) - minutes(other.startTime), 0);
            const score = travelCost * 3 + dailyLoad / 30 + (room.capacity - demand.classSize) / Math.max(1, room.capacity) * 10 + start / 600 + day / 10;
            candidates.push({ row, score });
          }
          if (searchLimited) break;
        }
        if (searchLimited) break;
      }
      candidates.sort((a, b) => a.score - b.score || a.row.room.localeCompare(b.row.room));
      for (const candidate of candidates.slice(0, 8)) next.push({ rows: [...state.rows, candidate.row], missed: state.missed, score: state.score + candidate.score });
      next.push({ ...state, missed: [...state.missed, { ...task, reason: !eligible[task.demandIndex].length
        ? "No verified available room on the selected campus meets capacity, room type and equipment requirements."
        : searchLimited ? "Bounded search exhausted. Reduce this batch or revise requirements; this is not proof of infeasibility." : lastReason }] });
    }
    states = next.sort((a, b) => a.missed.length - b.missed.length || a.score - b.score).slice(0, 16);
  }
  const best = states[0];
  const allocations = best.rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.room.localeCompare(b.room));
  let walking = 0;
  const proposed = new Set<Allocation>(allocations);
  const people = new Map<string, Allocation[]>();
  for (const row of [...existing, ...allocations]) {
    for (const key of [`lecturer:${normalise(row.lecturer)}`, `cohort:${row.department}:${normalise(row.cohort)}`]) {
      if (!people.has(key)) people.set(key, []);
      people.get(key)!.push(row);
    }
  }
  for (const rows of people.values()) {
    rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a.dayOfWeek !== b.dayOfWeek || (!proposed.has(a) && !proposed.has(b))) continue;
      const ar = rooms.find((room) => room.id === a.room), br = rooms.find((room) => room.id === b.room);
      if (ar && br) walking += Math.max(0, (travelMinutes(ar, br) ?? 5) - 5);
    }
  }
  const capacity = allocations.reduce((sum, row) => sum + (rooms.find((room) => room.id === row.room)?.capacity ?? 0), 0);
  return {
    allocations, unscheduled: best.missed,
    warnings: [
      "Travel times are conservative walking estimates, not verified pedestrian routes or shuttle schedules. Confirm accessibility and real routes before publishing.",
      "Existing drafts, published allocations and future pending/confirmed bookings are preserved. Terms are conservatively treated as concurrent because term dates are not yet recorded.",
      ...(rooms.some((room) => room.isAvailable && (!room.point || !campusFor(room.point))) ? ["Some rooms were excluded because their campus coordinates need verification."] : []),
      ...(searchLimited ? ["Search budget reached: this heuristic does not guarantee a globally optimal or complete timetable."] : []),
    ],
    metrics: { requested: tasks.length, scheduled: allocations.length, estimatedWalkingMinutes: walking,
      roomUtilisationPercent: capacity ? Math.round(allocations.reduce((sum, row) => sum + row.classSize, 0) / capacity * 100) : 0, searchLimited, candidateEvaluations: evaluations },
  };
}
