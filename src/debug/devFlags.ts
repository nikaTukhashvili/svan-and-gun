/**
 * Dev tools (Training Ground) are always on in `npm run dev` and test builds. On a production
 * build (GitHub Pages) they appear only when the URL has ?dev.
 */
export const devToolsEnabled =
  import.meta.env.DEV ||
  import.meta.env.MODE === 'test' ||
  new URLSearchParams(window.location.search).has('dev');
