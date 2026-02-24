import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

/**
 * Runs a light fade-in + slide-up on the container and optional stagger on children.
 * Call with a ref on the page container and optional child selector (e.g. '.feature-card').
 */
export function usePageAnimate(childSelector?: string) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const duration = 520;
    const childDuration = 400;

    animate(
      el,
      {
        opacity: [0.6, 1],
        duration: duration * 0.6,
        ease: 'outCubic',
      }
    );

    if (childSelector) {
      const children = el.querySelectorAll(childSelector);
      if (children.length) {
        animate(children, {
          opacity: [0, 1],
          y: [18, 0],
          duration: childDuration,
          delay: stagger(70, { from: 'first' }),
          ease: 'outCubic',
        });
      }
    }
  }, [childSelector]);

  return ref;
}
