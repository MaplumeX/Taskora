// @taskora/ui — cross-client business components
//
// Web and desktop import components through the package subpath
// (`@taskora/ui/components/...`); this barrel only re-exports the most
// commonly used entry points.

export { cn } from './lib/utils';

export { AppShell } from './components/layout/AppShell';
export { Sidebar } from './components/layout/Sidebar';
export { MainContent } from './components/layout/MainContent';
export { mainNav, type NavItem } from './components/layout/navItems';

export { FeedListView } from './components/feed/FeedListView';
export { GroupedFeedListView } from './components/feed/GroupedFeedListView';
export { TimeViewFeedList } from './components/feed/TimeViewFeedList';
export { TaskListView } from './components/task/TaskListView';
export { TaskItem } from './components/task/TaskItem';
export { SearchModal } from './components/search/SearchModal';
export { SettingsModal } from './components/settings/SettingsModal';
