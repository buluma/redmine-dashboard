import createMiddleware from 'next-intl/middleware';

export const locales = ['en', 'es', 'de', 'fr', 'ja', 'zh'];
export const defaultLocale = 'en';

export const localePrefix = 'always'; // or 'as-needed', 'never'

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
});