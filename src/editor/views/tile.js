// @ts-nocheck
import { JOURNEY_VIDEO_EDITOR_TILE_MODES } from '../../index.js';

import { tileLabel } from './shared.js';

export function createTileSlotView(index, createView) {
  let context = null;
  let select = null;
  let body = null;
  let view = null;
  let mountedMode = null;
  return {
    mode: 'tile',
    mount(nextContext) {
      context = nextContext;
      const toolbar = nextContext.doc.createElement('div');
      toolbar.className = 'jve-tile-toolbar';
      select = nextContext.doc.createElement('select');
      for (const mode of JOURNEY_VIDEO_EDITOR_TILE_MODES) {
        const option = nextContext.doc.createElement('option');
        option.value = mode;
        option.textContent = tileLabel(mode);
        select.append(option);
      }
      select.addEventListener('change', () => {
        nextContext.dispatch({ type: 'setTileMode', index, mode: select.value });
      });
      toolbar.append(select);
      body = nextContext.doc.createElement('div');
      body.className = 'jve-tile-body';
      nextContext.body.replaceChildren(toolbar, body);
    },
    update(snapshot) {
      if (!context || !select || !body) return;
      const mode = snapshot.editorState.tileModes?.[index] ?? 'xy';
      select.value = mode;
      if (mountedMode !== mode) {
        disposeNestedView();
        body.replaceChildren();
        view = createView(mode);
        mountedMode = mode;
        try {
          Promise.resolve(view.mount({ ...context, body })).catch(context.reportError);
        } catch (error) {
          context.reportError(error);
          view = null;
          mountedMode = null;
          return;
        }
      }
      view?.update?.(snapshot);
    },
    resize(size) {
      view?.resize?.(size);
    },
    dispose() {
      disposeNestedView();
      context?.body.replaceChildren();
      context = null;
      select = null;
      body = null;
    },
  };

  function disposeNestedView() {
    try {
      Promise.resolve(view?.dispose?.()).catch((error) => context?.reportError?.(error));
    } catch (error) {
      context?.reportError?.(error);
    }
    view = null;
    mountedMode = null;
  }
}
