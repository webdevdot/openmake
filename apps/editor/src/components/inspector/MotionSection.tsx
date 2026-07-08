import { useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import {
  fadeIn,
  fadeOut,
  resize,
  rotate,
  scaleIn,
  scaleOut,
  stackAnimation,
  type PresetContext,
} from '@openmake/core';
import type { Easing, NodeAnimation, SceneNode } from '@openmake/shared';
import { cssKeyframesFor } from '@openmake/codegen';
import { NumberField } from './NumberField.js';
import { useAnimationStore } from '../../store/animation.js';

/** A CSS-identifier-safe keyframes name derived from the node's name/id. */
function animName(node: SceneNode): string {
  const base = (node.name || node.type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'node'}-anim`;
}

export interface MotionSectionProps {
  doc: OpenDoc;
  node: SceneNode;
}

type PresetId = 'fadeIn' | 'fadeOut' | 'rotate' | 'scaleIn' | 'scaleOut' | 'resize';

const PRESET_LABELS: Record<PresetId, string> = {
  fadeIn: 'Fade in',
  fadeOut: 'Fade out',
  rotate: 'Rotate',
  scaleIn: 'Scale in',
  scaleOut: 'Scale out',
  resize: 'Resize',
};

const EASINGS: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
const EASING_LABELS: Record<Easing, string> = {
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in-out',
};

/** Build a preset fragment relative to the node, then stamp the chosen easing. */
function buildPreset(
  preset: PresetId,
  duration: number,
  easing: Easing,
  ctx: PresetContext,
): NodeAnimation {
  let anim: NodeAnimation;
  switch (preset) {
    case 'fadeIn':
      anim = fadeIn(duration, ctx);
      break;
    case 'fadeOut':
      anim = fadeOut(duration, ctx);
      break;
    case 'rotate':
      anim = rotate(duration, 1, ctx);
      break;
    case 'scaleIn':
      anim = scaleIn(duration, ctx);
      break;
    case 'scaleOut':
      anim = scaleOut(duration, ctx);
      break;
    case 'resize':
      // A visible default nudge; the user tunes via the duration/easing controls.
      anim = resize(duration, ctx.width * 0.5, ctx.height * 0.5, ctx);
      break;
  }
  return {
    ...anim,
    tracks: anim.tracks.map((t) => ({
      ...t,
      keyframes: t.keyframes.map((k) => ({ ...k, easing })),
    })),
  };
}

export function MotionSection({ doc, node }: MotionSectionProps) {
  const animation = node.animation;
  const [preset, setPreset] = useState<PresetId>('fadeIn');
  const [easing, setEasing] = useState<Easing>('ease-in-out');

  const playing = useAnimationStore((s) => s.playing?.nodeId === node.id);
  const play = useAnimationStore((s) => s.play);
  const stop = useAnimationStore((s) => s.stop);

  const ctx: PresetContext = {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
  };

  const duration = animation?.duration ?? 300;

  const addPreset = () => {
    const fragment = buildPreset(preset, duration, easing, ctx);
    const next = stackAnimation(animation, fragment);
    doc.updateNode(node.id, { animation: next });
    doc.commitUndoGroup();
  };

  const setDuration = (ms: number) => {
    if (!animation) return;
    const clamped = Math.max(1, ms);
    doc.updateNode(node.id, { animation: { ...animation, duration: clamped } });
    doc.commitUndoGroup();
  };

  const remove = () => {
    if (playing) stop();
    doc.updateNode(node.id, { animation: undefined });
    doc.commitUndoGroup();
  };

  const copyCss = () => {
    if (!animation) return;
    const css = cssKeyframesFor(animName(node), animation);
    // Clipboard is absent in some environments (tests, insecure contexts); guard it.
    void navigator.clipboard?.writeText(css);
  };

  const togglePlay = () => {
    if (playing) {
      stop();
      return;
    }
    if (!animation) return;
    play(node.id, animation, performance.now());
  };

  return (
    <div className="border-b p-2 border-app" data-testid="motion-section">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-app">Motion</span>
        {animation && (
          <button
            type="button"
            data-testid="motion-remove-button"
            className="text-xs text-secondary-app"
            onClick={remove}
          >
            Remove
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 py-0.5">
        <select
          data-testid="motion-preset-select"
          className="min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={preset}
          onChange={(e) => setPreset(e.target.value as PresetId)}
        >
          {(Object.keys(PRESET_LABELS) as PresetId[]).map((id) => (
            <option key={id} value={id}>
              {PRESET_LABELS[id]}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="motion-add-button"
          className="rounded px-2 py-0.5 text-xs bg-hover-app"
          onClick={addPreset}
        >
          Add
        </button>
      </div>

      <div className="flex items-center gap-1 py-0.5">
        <span className="w-12 text-xs text-secondary-app">Easing</span>
        <select
          data-testid="motion-easing-select"
          className="min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={easing}
          onChange={(e) => setEasing(e.target.value as Easing)}
        >
          {EASINGS.map((e) => (
            <option key={e} value={e}>
              {EASING_LABELS[e]}
            </option>
          ))}
        </select>
      </div>

      {animation && (
        <>
          <div className="py-0.5">
            <NumberField
              label="ms"
              value={animation.duration}
              onCommit={setDuration}
              testId="motion-duration-input"
              step={50}
            />
          </div>
          <div className="py-0.5 text-xs text-secondary-app" data-testid="motion-track-count">
            {animation.tracks.length} track{animation.tracks.length === 1 ? '' : 's'}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="motion-play-button"
              className="flex-1 rounded px-2 py-1 text-xs bg-hover-app"
              onClick={togglePlay}
            >
              {playing ? 'Stop' : 'Play'}
            </button>
            <button
              type="button"
              data-testid="motion-copy-css-button"
              className="flex-1 rounded px-2 py-1 text-xs bg-hover-app"
              onClick={copyCss}
            >
              Copy CSS
            </button>
          </div>
        </>
      )}
    </div>
  );
}
