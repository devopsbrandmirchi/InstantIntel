import { useLayoutEffect } from 'react';

/** Inline colors so auth screens stay stable before Tailwind loads / no transparent gaps. */
export const AUTH_BRAND_NAVY = '#1A334B';
export const AUTH_PANEL_WHITE = '#ffffff';

export const authInputWrapClass =
  'flex items-center gap-3 w-full rounded border border-gray-300 bg-white px-3 py-3 focus-within:ring-1 focus-within:ring-brand-navy/30 focus-within:border-gray-400';

/** Navy page chrome while login/signup is mounted (restored on unmount). */
export function useAuthPageChrome() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      htmlMinH: html.style.minHeight,
      bodyMinH: body.style.minHeight,
      rootMinH: root?.style.minHeight ?? ''
    };
    html.style.backgroundColor = AUTH_BRAND_NAVY;
    body.style.backgroundColor = AUTH_BRAND_NAVY;
    html.style.minHeight = '100%';
    body.style.minHeight = '100%';
    if (root) root.style.minHeight = '100%';
    return () => {
      html.style.backgroundColor = prev.htmlBg;
      body.style.backgroundColor = prev.bodyBg;
      html.style.minHeight = prev.htmlMinH;
      body.style.minHeight = prev.bodyMinH;
      if (root) root.style.minHeight = prev.rootMinH;
    };
  }, []);
}
