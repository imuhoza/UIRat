/**
 * @file code.ts — Figma Plugin Sandbox Entry Point
 *
 * This is the main code that runs inside Figma's sandboxed QuickJS environment.
 * It receives FigmaNodeData JSON from the plugin UI (via postMessage) and
 * creates actual Figma nodes on the canvas.
 *
 * Communication flow:
 *   Plugin UI (ui.html) → postMessage → This file (code.ts) → Figma Plugin API
 *
 * The sandbox has access to the `figma` global object but cannot make network
 * requests or access the DOM. All user interaction happens through the UI iframe.
 */

import { createFigmaNode, type PluginNodeData } from './node-factory.js';

// =============================================================================
// PLUGIN INITIALIZATION
// =============================================================================

// Show the plugin UI panel
figma.showUI(__html__, {
  width: 520,
  height: 640,
  title: 'UIRat Importer',
});

// =============================================================================
// MESSAGE HANDLER — Receives data from the UI
// =============================================================================

/**
 * Handles messages sent from the plugin UI via parent.postMessage().
 *
 * Supported message types:
 * - "generate": Receives FigmaNodeData JSON and creates Figma nodes on the canvas.
 * - "cancel": Closes the plugin.
 */
figma.ui.onmessage = async (message: { type: string; data?: unknown }) => {
  if (message.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (message.type === 'generate') {
    try {
      const nodeData = message.data as PluginNodeData;

      if (!nodeData || !nodeData.type) {
        figma.notify('Error: Invalid node data. Please check your JSON.', { error: true });
        return;
      }

      figma.notify('UIRat: Generating design...', { timeout: 30000 });

      // Create the Figma node tree on the current page
      const rootNode = await createFigmaNode(nodeData, figma.currentPage);

      // Center the viewport on the created content
      figma.viewport.scrollAndZoomIntoView([rootNode]);

      // Count created nodes for the success message
      const nodeCount = countCreatedNodes(rootNode);
      figma.notify(`UIRat: Imported successfully! ${nodeCount} nodes created.`);

      // Notify the UI that generation is complete
      figma.ui.postMessage({ type: 'generate-complete', nodeCount });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      figma.notify(`UIRat Error: ${errorMessage}`, { error: true });
      figma.ui.postMessage({ type: 'generate-error', error: errorMessage });
    }
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Recursively counts all nodes in a Figma scene tree.
 * Used for the success notification message.
 *
 * @param node - The root Figma node.
 * @returns Total number of nodes (including the root).
 */
function countCreatedNodes(node: SceneNode): number {
  let count = 1;

  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count += countCreatedNodes(child as SceneNode);
    }
  }

  return count;
}
