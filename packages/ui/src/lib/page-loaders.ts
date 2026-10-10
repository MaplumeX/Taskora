import { moduleLoader, type ModuleLoader } from './module-loader';

/** 跨平台共用加载入口，只有调用时才 import，不挂载组件。 */
export const pageLoaders = {
  Home: moduleLoader(() => import('../pages/Home')),
  Inbox: moduleLoader(() => import('../pages/Inbox')),
  Today: moduleLoader(() => import('../pages/Today')),
  Upcoming: moduleLoader(() => import('../pages/Upcoming')),
  Anytime: moduleLoader(() => import('../pages/Anytime')),
  Someday: moduleLoader(() => import('../pages/Someday')),
  ProjectDetail: moduleLoader(() => import('../pages/ProjectDetail')),
  AreaDetail: moduleLoader(() => import('../pages/AreaDetail')),
  Calendar: moduleLoader(() => import('../pages/Calendar')),
  Review: moduleLoader(() => import('../pages/Review')),
  Logbook: moduleLoader(() => import('../pages/Logbook')),
  Deadlines: moduleLoader(() => import('../pages/Deadlines')),
  Tomorrow: moduleLoader(() => import('../pages/Tomorrow')),
  Repeating: moduleLoader(() => import('../pages/Repeating')),
  AllProjects: moduleLoader(() => import('../pages/AllProjects')),
  LoggedProjects: moduleLoader(() => import('../pages/LoggedProjects')),
  LaterProjects: moduleLoader(() => import('../pages/LaterProjects')),
  Tags: moduleLoader(() => import('../pages/Tags')),
  TagDetail: moduleLoader(() => import('../pages/TagDetail')),
  Trash: moduleLoader(() => import('../pages/Trash')),
  Search: moduleLoader(() => import('../pages/Search')),
  Agent: moduleLoader(() => import('../pages/Agent')),
};

export const shellLoaders = {
  SettingsModal: moduleLoader(() =>
    import('../components/settings/SettingsModal').then((module) => ({
      default: module.SettingsModal,
    })),
  ),
  AssistantPanel: moduleLoader(() =>
    import('../components/agent/AssistantPanel').then((module) => ({
      default: module.AssistantPanel,
    })),
  ),
};

export const settingsLoaders = {
  general: moduleLoader(() => import('../components/settings/SettingsGeneral')),
  appearance: moduleLoader(() => import('../components/settings/SettingsAppearance')),
  shortcuts: moduleLoader(() => import('../components/settings/SettingsShortcuts')),
  account: moduleLoader(() => import('../components/settings/SettingsAccount')),
  data: moduleLoader(() => import('../components/settings/SettingsData')),
  about: moduleLoader(() => import('../components/settings/SettingsAbout')),
  assistant: moduleLoader(() => import('../components/settings/SettingsAssistant')),
  calendars: moduleLoader(() => import('../components/settings/SettingsCalendars')),
};

export function loaderForRoute(pathname: string): ModuleLoader<unknown> | undefined {
  if (pathname.startsWith('/projects/')) return pageLoaders.ProjectDetail;
  if (pathname.startsWith('/areas/')) return pageLoaders.AreaDetail;
  if (pathname.startsWith('/tags/')) return pageLoaders.TagDetail;
  if (pathname === '/review' || pathname.startsWith('/review/')) return pageLoaders.Review;
  const routes: Record<string, ModuleLoader<unknown>> = {
    '/': pageLoaders.Today,
    '/home': pageLoaders.Home,
    '/inbox': pageLoaders.Inbox,
    '/today': pageLoaders.Today,
    '/upcoming': pageLoaders.Upcoming,
    '/anytime': pageLoaders.Anytime,
    '/someday': pageLoaders.Someday,
    '/calendar': pageLoaders.Calendar,
    '/logbook': pageLoaders.Logbook,
    '/deadlines': pageLoaders.Deadlines,
    '/tomorrow': pageLoaders.Tomorrow,
    '/repeating': pageLoaders.Repeating,
    '/all-projects': pageLoaders.AllProjects,
    '/logged-projects': pageLoaders.LoggedProjects,
    '/later-projects': pageLoaders.LaterProjects,
    '/tags': pageLoaders.Tags,
    '/trash': pageLoaders.Trash,
    '/search': pageLoaders.Search,
    '/agent': pageLoaders.Agent,
    '/settings': shellLoaders.SettingsModal,
    '/assistant-panel': shellLoaders.AssistantPanel,
  };
  return routes[pathname];
}
