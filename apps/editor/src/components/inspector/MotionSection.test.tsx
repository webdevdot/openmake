import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { NodeAnimation } from '@openmake/shared';
import { MotionSection } from './MotionSection.js';
import { useAnimationStore } from '../../store/animation.js';

function newRect() {
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
  return { doc, rectId };
}

afterEach(() => {
  useAnimationStore.getState().stop();
});

describe('MotionSection', () => {
  it('adds a fadeIn animation to the node via updateNode when Add is clicked', () => {
    const { doc, rectId } = newRect();
    const node = doc.getNode(rectId)!;

    render(<MotionSection doc={doc} node={node} />);
    // Default preset is fadeIn.
    fireEvent.click(screen.getByTestId('motion-add-button'));

    const updated = doc.getNode(rectId)!;
    const anim = updated.animation as NodeAnimation;
    expect(anim).toBeDefined();
    expect(anim.duration).toBe(300);
    expect(anim.tracks).toHaveLength(1);
    expect(anim.tracks[0]!.property).toBe('opacity');
    // fadeIn: 0 -> current opacity (1).
    expect(anim.tracks[0]!.keyframes[0]!.value).toBe(0);
    expect(anim.tracks[0]!.keyframes[1]!.value).toBe(1);
  });

  it('applies the selected easing to a newly added preset', () => {
    const { doc, rectId } = newRect();
    const node = doc.getNode(rectId)!;

    render(<MotionSection doc={doc} node={node} />);
    fireEvent.change(screen.getByTestId('motion-easing-select'), {
      target: { value: 'linear' },
    });
    fireEvent.click(screen.getByTestId('motion-add-button'));

    const anim = doc.getNode(rectId)!.animation as NodeAnimation;
    expect(anim.tracks[0]!.keyframes.every((k) => k.easing === 'linear')).toBe(true);
  });

  it('stacks a second preset, unioning tracks (later-property wins)', () => {
    const { doc, rectId } = newRect();

    const { rerender } = render(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    // Add fadeIn (opacity).
    fireEvent.click(screen.getByTestId('motion-add-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);

    // Switch to rotate and add again.
    fireEvent.change(screen.getByTestId('motion-preset-select'), {
      target: { value: 'rotate' },
    });
    fireEvent.click(screen.getByTestId('motion-add-button'));

    const anim = doc.getNode(rectId)!.animation as NodeAnimation;
    const props = anim.tracks.map((t) => t.property).sort();
    expect(props).toEqual(['opacity', 'rotation']);
  });

  it('edits the duration through the NumberField', () => {
    const { doc, rectId } = newRect();
    const { rerender } = render(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    fireEvent.click(screen.getByTestId('motion-add-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);

    const input = screen.getByTestId('motion-duration-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '800' } });
    fireEvent.blur(input);

    expect((doc.getNode(rectId)!.animation as NodeAnimation).duration).toBe(800);
  });

  it('Play starts editor-local playback without writing sampled values to the doc', () => {
    const { doc, rectId } = newRect();
    const { rerender } = render(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    fireEvent.click(screen.getByTestId('motion-add-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);

    const before = doc.getNode(rectId)!;
    fireEvent.click(screen.getByTestId('motion-play-button'));

    expect(useAnimationStore.getState().playing?.nodeId).toBe(rectId);
    // The node's persisted opacity is untouched by playback.
    expect(doc.getNode(rectId)!.opacity).toBe(before.opacity);
    // An override was seeded for the playing node.
    expect(useAnimationStore.getState().overrides[rectId]).toBeDefined();
  });

  it('Stop clears playback overrides', () => {
    const { doc, rectId } = newRect();
    const { rerender } = render(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    fireEvent.click(screen.getByTestId('motion-add-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);

    fireEvent.click(screen.getByTestId('motion-play-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    fireEvent.click(screen.getByTestId('motion-play-button')); // now labeled Stop

    expect(useAnimationStore.getState().playing).toBeNull();
    expect(useAnimationStore.getState().overrides).toEqual({});
  });

  it('Remove deletes the animation from the node', () => {
    const { doc, rectId } = newRect();
    const { rerender } = render(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);
    fireEvent.click(screen.getByTestId('motion-add-button'));
    rerender(<MotionSection doc={doc} node={doc.getNode(rectId)!} />);

    fireEvent.click(screen.getByTestId('motion-remove-button'));
    expect(doc.getNode(rectId)!.animation).toBeUndefined();
  });
});
