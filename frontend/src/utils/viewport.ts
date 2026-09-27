import { useMediaQuery } from '@vueuse/core';

/** Below the `md` breakpoint Books renders its phone layout. */
export const isMobile = useMediaQuery('(max-width: 767px)');
