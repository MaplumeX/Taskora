import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonZh from './locales/zh/common.json';
import navZh from './locales/zh/nav.json';
import taskZh from './locales/zh/task.json';
import projectZh from './locales/zh/project.json';
import areaZh from './locales/zh/area.json';
import tagZh from './locales/zh/tag.json';
import authZh from './locales/zh/auth.json';
import searchZh from './locales/zh/search.json';
import themeZh from './locales/zh/theme.json';
import settingsZh from './locales/zh/settings.json';

import commonEn from './locales/en/common.json';
import navEn from './locales/en/nav.json';
import taskEn from './locales/en/task.json';
import projectEn from './locales/en/project.json';
import areaEn from './locales/en/area.json';
import tagEn from './locales/en/tag.json';
import authEn from './locales/en/auth.json';
import searchEn from './locales/en/search.json';
import themeEn from './locales/en/theme.json';
import settingsEn from './locales/en/settings.json';

export const defaultNS = 'common';
export const namespaces = [
  'common',
  'nav',
  'task',
  'project',
  'area',
  'tag',
  'auth',
  'search',
  'theme',
  'settings',
] as const;

void i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    resources: {
      zh: {
        common: commonZh,
        nav: navZh,
        task: taskZh,
        project: projectZh,
        area: areaZh,
        tag: tagZh,
        auth: authZh,
        search: searchZh,
        theme: themeZh,
        settings: settingsZh,
      },
      en: {
        common: commonEn,
        nav: navEn,
        task: taskEn,
        project: projectEn,
        area: areaEn,
        tag: tagEn,
        auth: authEn,
        search: searchEn,
        theme: themeEn,
        settings: settingsEn,
      },
    },
    supportedLngs: ['zh', 'en'],
    fallbackLng: 'en',
    ns: namespaces,
    defaultNS,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'taskora-lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export { i18n };