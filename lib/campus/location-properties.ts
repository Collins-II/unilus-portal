export function hasTeachingProperties(spaceType: unknown): boolean {
  return spaceType === "lecture_room" || spaceType === "laboratory" || spaceType === "seminar_room";
}
