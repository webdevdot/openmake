import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { NodeAnimation } from '@openmake/shared';
import { TimelinePanel } from './TimelinePanel.js';
import { useAnimationStore } from '../../store/animation.js';

const LABEL_WIDTH = 96;
const LANE_WIDTH = 400;

/** A rect with a fadeIn (opacity) + rotate (rotation) animation, duration 1000ms. */
function newAnimatedRect(): { doc: OpenDoc; rectId: string } {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    opacity: 1,
  });
  const animation: NodeAnimation = {
    duration: 1000,
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 500, value: 1, easing: 'linear' },
          { time: 1000, value: 1, easing: 'linear' },
        ],
      },
      {
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 1000, value: 360, easing: 'linear' },
        ],
      },
    ],
  };
  doc.updateNode(rectId, { animation });
  doc.commitUndoGroup();
  return { doc, rectId };
}

function newPlainRect(): { doc: OpenDoc; rectId: string } {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({ type: 'RECTANGLE', parentId: pageId, opacity: 1 });
  return { doc, rectId };
}

// happy-dom has no layout engine: give the lane a stable width + client rect so
// time<->pixel math resolves. The ruler div is the measured element.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return LANE_WIDTH;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: LABEL_WIDTH,
    top: 0,
    right: LABEL_WIDTH + LANE_WIDTH,
    bottom: 20,
    width: LANE_WIDTH,
    height: 20,
    x: LABEL_WIDTH,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  // pointer capture is a noop in happy-dom
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

afterEach(() => {
  useAnimationStore.getState().stop();
  vi.restoreAllMocks();
});

describe('TimelinePanel', () => {
  it('renders a lane and keyframe diamonds per track when the node is animated', () => {
    const { doc, rectId } = newAnimatedRect();
    render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);

    expect(screen.getByTestId('timeline-panel')).toBeTruthy();
    expect(screen.getByTestId('timeline-track-opacity')).toBeTruthy();
    expect(screen.getByTestId('timeline-track-rotation')).toBeTruthy();
    // opacity track has 3 keyframes, rotation has 2.
    expect(screen.getByTestId('timeline-keyframe-opacity-0')).toBeTruthy();
    expect(screen.getByTestId('timeline-keyframe-opacity-1')).toBeTruthy();
    expect(screen.getByTestId('timeline-keyframe-opacity-2')).toBeTruthy();
    expect(screen.getByTestId('timeline-keyframe-rotation-0')).toBeTruthy();
    expect(screen.getByTestId('timeline-keyframe-rotation-1')).toBeTruthy();
    expect(screen.queryByTestId('timeline-keyframe-rotation-2')).toBeNull();
  });

  it('renders nothing when the node has no animation', () => {
    const { doc, rectId } = newPlainRect();
    const { container } = render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);
    expect(container.firstChild).toBeNull();
  });

  it('scrubbing the ruler publishes a paused override without writing the doc', () => {
    const { doc, rectId } = newAnimatedRect();
    render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);
    const versionBefore = doc.version;

    // Click the ruler at its midpoint (x = LABEL_WIDTH + 200 → t = 500ms).
    const ruler = screen.getByTestId('timeline-ruler');
    fireEvent.pointerDown(ruler, { clientX: LABEL_WIDTH + 200, pointerId: 1 });

    const state = useAnimationStore.getState();
    expect(state.playing).toBeNull();
    expect(state.time).toBeCloseTo(500, 3);
    // At t=500 opacity has reached 1 and rotation is halfway (180).
    const override = state.overrides[rectId]!;
    expect(override.opacity).toBeCloseTo(1, 3);
    expect(override.rotation).toBeCloseTo(180, 3);
    // The doc was never mutated by scrubbing.
    expect(doc.version).toBe(versionBefore);
  });

  it('retiming a keyframe writes updateNode on pointer-up (single undo step)', () => {
    const { doc, rectId } = newAnimatedRect();
    render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);
    const versionBefore = doc.version;

    // Drag opacity keyframe #1 (t=500) toward t=250 (x = LABEL_WIDTH + 100).
    const kf = screen.getByTestId('timeline-keyframe-opacity-1');
    fireEvent.pointerDown(kf, { clientX: LABEL_WIDTH + 200, pointerId: 2 });
    // No doc write mid-drag.
    fireEvent.pointerMove(kf, { clientX: LABEL_WIDTH + 100, pointerId: 2 });
    expect(doc.version).toBe(versionBefore);

    fireEvent.pointerUp(kf, { clientX: LABEL_WIDTH + 100, pointerId: 2 });

    // Exactly one new version (one undo group) and the keyframe was retimed.
    expect(doc.version).toBe(versionBefore + 1);
    const anim = doc.getNode(rectId)!.animation as NodeAnimation;
    const opacity = anim.tracks.find((t) => t.property === 'opacity')!;
    expect(opacity.keyframes[1]!.time).toBeCloseTo(250, 3);
    // Track stays sorted and the neighbors are untouched.
    expect(opacity.keyframes[0]!.time).toBe(0);
    expect(opacity.keyframes[2]!.time).toBe(1000);

    // One undo returns the keyframe to 500ms.
    doc.undo();
    const reverted = doc.getNode(rectId)!.animation as NodeAnimation;
    expect(reverted.tracks.find((t) => t.property === 'opacity')!.keyframes[1]!.time).toBe(500);
  });

  it('retime clamps a keyframe so it cannot cross its neighbor', () => {
    const { doc, rectId } = newAnimatedRect();
    render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);

    // Drag opacity keyframe #1 (t=500) far past its right neighbor (t=1000).
    const kf = screen.getByTestId('timeline-keyframe-opacity-1');
    fireEvent.pointerDown(kf, { clientX: LABEL_WIDTH + 200, pointerId: 3 });
    fireEvent.pointerUp(kf, { clientX: LABEL_WIDTH + 5000, pointerId: 3 });

    const anim = doc.getNode(rectId)!.animation as NodeAnimation;
    const opacity = anim.tracks.find((t) => t.property === 'opacity')!;
    // Clamped to the right neighbor at 1000, never past it.
    expect(opacity.keyframes[1]!.time).toBe(1000);
  });

  it('Play/Pause toggles editor-local playback via the shared store', () => {
    const { doc, rectId } = newAnimatedRect();
    render(<TimelinePanel doc={doc} node={doc.getNode(rectId)!} />);

    fireEvent.click(screen.getByTestId('timeline-play-button'));
    expect(useAnimationStore.getState().playing?.nodeId).toBe(rectId);
    // Persisted pose is untouched by playback.
    expect(doc.getNode(rectId)!.opacity).toBe(1);

    fireEvent.click(screen.getByTestId('timeline-play-button'));
    expect(useAnimationStore.getState().playing).toBeNull();
  });
});
