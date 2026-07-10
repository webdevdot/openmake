import type { RefObject } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenDoc, getWorldBounds } from '@openmake/core';
import { DEFAULT_CAMERA, type Camera } from '../../canvas/camera.js';
import { OverlayLayer } from './OverlayLayer.js';

// Regression for the version-restore crash: a restore (or a collaborator)
// deletes a node that is still in the local selection. The overlay must not
// call getWorldBounds on the missing node — that throws "Node does not exist"
// and takes down the whole editor via the router error boundary.
describe('OverlayLayer — stale selection after node deletion', () => {
  it('renders without throwing when the single selected node no longer exists', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 0, y: 0 } as never);

    // Node is selected, then deleted out from under the selection.
    doc.deleteNode(nodeId);
    expect(doc.getNode(nodeId)).toBeUndefined();

    const cameraRef: RefObject<Camera> = { current: { ...DEFAULT_CAMERA } };

    expect(() =>
      render(
        <OverlayLayer
          doc={doc}
          pageId={pageId}
          selection={[nodeId]}
          cameraRef={cameraRef}
          marquee={null}
          snapGuides={[]}
          setSnapGuides={() => {}}
          getWorldBounds={(id) => getWorldBounds(doc, id)}
        />,
      ),
    ).not.toThrow();
  });
});
