import type { AutoLayout } from '@openmake/shared';
import { round2 } from './color.js';

export interface FlexLayout {
  css: Record<string, string>;
  tw: string[];
}

const ALIGN_ITEMS_CSS: Record<AutoLayout['alignItems'], string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  BASELINE: 'baseline',
};

const ALIGN_ITEMS_TW: Record<AutoLayout['alignItems'], string> = {
  MIN: 'items-start',
  CENTER: 'items-center',
  MAX: 'items-end',
  BASELINE: 'items-baseline',
};

const JUSTIFY_CONTENT_CSS: Record<AutoLayout['justifyContent'], string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
};

const JUSTIFY_CONTENT_TW: Record<AutoLayout['justifyContent'], string> = {
  MIN: 'justify-start',
  CENTER: 'justify-center',
  MAX: 'justify-end',
  SPACE_BETWEEN: 'justify-between',
};

/** Auto-layout container → flexbox declarations, mirrored as raw CSS and Tailwind classes. */
export function computeFlexLayout(autoLayout: AutoLayout): FlexLayout {
  const css: Record<string, string> = { display: 'flex' };
  const tw: string[] = ['flex'];

  const direction = autoLayout.mode === 'HORIZONTAL' ? 'row' : 'column';
  css['flex-direction'] = direction;
  tw.push(direction === 'row' ? 'flex-row' : 'flex-col');

  if (autoLayout.gap > 0) {
    css['gap'] = `${round2(autoLayout.gap)}px`;
    tw.push(`gap-[${round2(autoLayout.gap)}px]`);
  }

  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = autoLayout;
  if (
    paddingTop === paddingRight &&
    paddingRight === paddingBottom &&
    paddingBottom === paddingLeft
  ) {
    if (paddingTop > 0) {
      css['padding'] = `${round2(paddingTop)}px`;
      tw.push(`p-[${round2(paddingTop)}px]`);
    }
  } else {
    if (paddingTop > 0) {
      css['padding-top'] = `${round2(paddingTop)}px`;
      tw.push(`pt-[${round2(paddingTop)}px]`);
    }
    if (paddingRight > 0) {
      css['padding-right'] = `${round2(paddingRight)}px`;
      tw.push(`pr-[${round2(paddingRight)}px]`);
    }
    if (paddingBottom > 0) {
      css['padding-bottom'] = `${round2(paddingBottom)}px`;
      tw.push(`pb-[${round2(paddingBottom)}px]`);
    }
    if (paddingLeft > 0) {
      css['padding-left'] = `${round2(paddingLeft)}px`;
      tw.push(`pl-[${round2(paddingLeft)}px]`);
    }
  }

  css['align-items'] = ALIGN_ITEMS_CSS[autoLayout.alignItems];
  tw.push(ALIGN_ITEMS_TW[autoLayout.alignItems]);

  css['justify-content'] = JUSTIFY_CONTENT_CSS[autoLayout.justifyContent];
  tw.push(JUSTIFY_CONTENT_TW[autoLayout.justifyContent]);

  if (autoLayout.wrap) {
    css['flex-wrap'] = 'wrap';
    tw.push('flex-wrap');
  }

  return { css, tw };
}

export interface AbsolutePosition {
  css: Record<string, string>;
  tw: string[];
}

/** Position of a child inside a non-auto-layout (freeform) container. */
export function computeAbsolutePosition(
  x: number,
  y: number,
  width: number,
  height: number,
): AbsolutePosition {
  return {
    css: {
      position: 'absolute',
      left: `${round2(x)}px`,
      top: `${round2(y)}px`,
      width: `${round2(width)}px`,
      height: `${round2(height)}px`,
    },
    tw: [
      'absolute',
      `left-[${round2(x)}px]`,
      `top-[${round2(y)}px]`,
      `w-[${round2(width)}px]`,
      `h-[${round2(height)}px]`,
    ],
  };
}
