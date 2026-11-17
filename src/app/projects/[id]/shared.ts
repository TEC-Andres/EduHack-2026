import { api, type RouterOutputs } from "~/trpc/react";

export type Project = RouterOutputs["project"]["get"];
export type Activity = Project["activities"][number];
export type Member = Project["owner"];

export const membersOf = (p: Project): Member[] => {
  const team = p.team?.members.map((m) => m.user) ?? [];
  return team.some((u) => u.id === p.owner.id) ? team : [p.owner, ...team];
};

/** Activity mutations with optimistic cache updates so drag & drop feels instant. */
export function useActivityOps(projectId: number) {
  const utils = api.useUtils();
  const patch = (id: number, data: Partial<Activity>) => {
    void utils.project.get.cancel(projectId);
    utils.project.get.setData(projectId, (p) => p && { ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...data } : a)) });
  };
  const settle = () => utils.project.get.invalidate(projectId);
  return {
    update: api.project.updateActivity.useMutation({ onMutate: ({ id, data }) => patch(id, data as Partial<Activity>), onSettled: settle }),
    move: api.project.moveActivity.useMutation({ onMutate: ({ id, status, position }) => patch(id, { status, position }), onSettled: settle }),
    create: api.project.createActivity.useMutation({ onSettled: settle }),
    remove: api.project.deleteActivity.useMutation({ onSettled: settle }),
  };
}
