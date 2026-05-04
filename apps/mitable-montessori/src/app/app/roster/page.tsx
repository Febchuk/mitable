import { RosterFromDexie } from "@/components/app/roster-from-dexie";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";

export default async function RosterPage() {
  const classroom = await getActiveClassroomForCurrentUser();
  return (
    <RosterFromDexie
      classroomId={classroom?.id ?? null}
      classroomName={classroom?.name ?? null}
    />
  );
}
