import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectUiPrefsState {
  /** projectId -> whether the completed-tasks panel is expanded */
  completedPanelExpanded: Record<string, boolean>;
  setCompletedPanelExpanded: (projectId: string, expanded: boolean) => void;
}

export const useProjectUiPrefsStore = create<ProjectUiPrefsState>()(
  persist(
    (set) => ({
      completedPanelExpanded: {},
      setCompletedPanelExpanded: (projectId, expanded) =>
        set((state) => ({
          completedPanelExpanded: {
            ...state.completedPanelExpanded,
            [projectId]: expanded,
          },
        })),
    }),
    { name: 'taskora-project-ui-prefs' },
  ),
);