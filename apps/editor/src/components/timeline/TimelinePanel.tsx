import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import type { AnimTrack, NodeAnimation, SceneNode } from '@openmake/shared';
import { useAnimationStore } from '../../store/animation.js';
import { clampKeyframeTime, pxToTime, rulerTicks, timeToPx } from './timeline-math.js';

export interface TimelinePanelProps {
  doc: OpenDoc;
  node: SceneNode;
}

const PANEL_HEIGHT = 160;
/** Left gutter reserved for the property labels; the lane area starts after it. */
const LABEL_WIDTH = 96;
const RULER_INTERVALS = 8;

/** A whole-ms readout in seconds with two decimals, e.g. 1250 → "1.25s". */
function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Bottom-dock timeline for the selected node's animation. Shows a ruler, one
 * lane per track with keyframe diamonds, a scrub-able playhead, and a
 * Play/Pause button. Scrubbing publishes a paused preview through the shared
 * animation override store (never the doc); keyframe retime writes to the doc
 * only on pointer-up as a single undo group.
 *
 * Renders nothing unless the node has an animation (the caller also gates on a
 * single-node selection).
 */
export function TimelinePanel({ doc, node }: TimelinePanelProps) {
  const animation = node.animation;
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);

  const playing = useAnimationStore((s) => s.playing?.nodeId === node.id);
  // Live playback clock or last-scrubbed time; the store owns this so the
  // playhead stays in sync with rAF advances during playback.
  const playheadTime = useAnimationStore((s) => s.time);
  const play = useAnimationStore((s) => s.play);
  const stop = useAnimationStore((s) => s.stop);
  const scrub = useAnimationStore((s) => s.scrub);
  const clearScrub = useAnimationStore((s) => s.clearScrub);

  // Drag state for a keyframe retime: which track/keyframe and its live time.
  const dragRef = useRef<{ trackIndex: number; kfIndex: number } | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // On deselect (unmount) the panel drops any paused scrub preview so the node
  // snaps back to its authored pose. clearScrub is a no-op while playing.
  useEffect(() => clearScrub, [clearScrub]);

  useLayoutEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const measure = () => setLaneWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!animation) return null;

  const duration = animation.duration;

  const laneX = (time: number) => timeToPx(time, duration, laneWidth);

  const timeFromClientX = (clientX: number): number => {
    const el = laneRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    // Measure live off the element so the mapping never lags a stale render's
    // width (e.g. the very first interaction before a resize has re-rendered).
    return pxToTime(clientX - rect.left, duration, el.clientWidth || laneWidth);
  };

  // --- Scrub: click/drag the ruler or playhead → paused preview -------------
  const beginScrub = (clientX: number) => {
    scrub(node.id, animation, timeFromClientX(clientX));
  };

  const onRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    beginScrub(e.clientX);
  };
  const onRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    beginScrub(e.clientX);
  };

  // --- Keyframe retime: horizontal drag on a diamond, commit on pointer-up --
  const onKeyframePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    trackIndex: number,
    kfIndex: number,
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { trackIndex, kfIndex };
    const track = animation.tracks[trackIndex]!;
    setDragTime(track.keyframes[kfIndex]!.time);
  };

  const onKeyframePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const track = animation.tracks[drag.trackIndex]!;
    const times = track.keyframes.map((k) => k.time);
    const raw = timeFromClientX(e.clientX);
    setDragTime(clampKeyframeTime(raw, drag.kfIndex, times, duration));
  };

  const onKeyframePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const track = animation.tracks[drag.trackIndex]!;
    const times = track.keyframes.map((k) => k.time);
    const raw = timeFromClientX(e.clientX);
    const next = clampKeyframeTime(raw, drag.kfIndex, times, duration);
    dragRef.current = null;
    setDragTime(null);

    // Rewrite just this track with the retimed keyframe, kept sorted (the clamp
    // guarantees it can't cross a neighbor, so index order is preserved).
    const nextKeyframes = track.keyframes.map((k, i) =>
      i === drag.kfIndex ? { ...k, time: next } : k,
    );
    const nextTracks = animation.tracks.map((t, i) =>
      i === drag.trackIndex ? { ...t, keyframes: nextKeyframes } : t,
    );
    const nextAnim: NodeAnimation = { ...animation, tracks: nextTracks };
    doc.updateNode(node.id, { animation: nextAnim });
    doc.commitUndoGroup();
  };

  const togglePlay = () => {
    if (playing) {
      stop();
      return;
    }
    play(node.id, animation, performance.now());
  };

  const ticks = rulerTicks(duration, RULER_INTERVALS);

  return (
    <div
      className="flex shrink-0 flex-col border-t bg-panel border-app"
      style={{ height: PANEL_HEIGHT }}
      data-testid="timeline-panel"
    >
      {/* Header: title, current-time readout, Play/Pause */}
      <div className="flex items-center gap-2 border-b px-2 py-1 border-app">
        <span className="text-xs font-medium text-secondary-app">Timeline</span>
        <span className="text-xs text-secondary-app" data-testid="timeline-time-readout">
          {formatMs(playheadTime)} / {formatMs(duration)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="timeline-play-button"
          className="rounded px-2 py-0.5 text-xs bg-hover-app"
          onClick={togglePlay}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      {/* Ruler */}
      <div className="flex border-b border-app">
        <div className="shrink-0" style={{ width: LABEL_WIDTH }} />
        <div
          ref={laneRef}
          className="relative h-5 flex-1 cursor-pointer select-none"
          data-testid="timeline-ruler"
          onPointerDown={onRulerPointerDown}
          onPointerMove={onRulerPointerMove}
        >
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute top-0 flex h-full flex-col justify-between"
              style={{ left: laneX(t) }}
            >
              <span className="-translate-x-1/2 whitespace-nowrap pl-0.5 text-[9px] text-secondary-app">
                {formatMs(t)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Track lanes */}
      <div className="relative flex-1 overflow-y-auto">
        {animation.tracks.map((track: AnimTrack, trackIndex) => (
          <div
            key={`${track.property}-${trackIndex}`}
            className="flex h-8 items-center border-b border-app"
            data-testid={`timeline-track-${track.property}`}
          >
            <div
              className="shrink-0 truncate px-2 text-xs text-secondary-app"
              style={{ width: LABEL_WIDTH }}
            >
              {track.property}
            </div>
            <div className="relative h-full flex-1">
              {track.keyframes.map((kf, kfIndex) => {
                const isDragging =
                  dragRef.current?.trackIndex === trackIndex &&
                  dragRef.current.kfIndex === kfIndex;
                const t = isDragging && dragTime !== null ? dragTime : kf.time;
                return (
                  <div
                    key={kfIndex}
                    role="button"
                    aria-label={`${track.property} keyframe ${kfIndex}`}
                    data-testid={`timeline-keyframe-${track.property}-${kfIndex}`}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize border border-app bg-floating-app"
                    style={{ left: laneX(t) }}
                    onPointerDown={(e) => onKeyframePointerDown(e, trackIndex, kfIndex)}
                    onPointerMove={onKeyframePointerMove}
                    onPointerUp={onKeyframePointerUp}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Playhead line spanning the lane area */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px"
          data-testid="timeline-playhead"
          style={{
            left: LABEL_WIDTH + laneX(playheadTime),
            backgroundColor: 'var(--color-accent)',
          }}
        />
      </div>
    </div>
  );
}
