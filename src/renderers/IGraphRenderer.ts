import * as vscode from 'vscode';
import { Layer, LayoutType } from '../types';

/**
 * Common interface for graph renderers
 * Currently uses Cytoscape renderer.
 */
export interface IGraphRenderer extends vscode.WebviewViewProvider {
    /**
     * Show the graph view
     */
    show(): void;

    /**
     * Refresh/regenerate the graph from codebase
     * @param changedFilePath - Optional path to a changed file for incremental updates
     */
    refresh(changedFilePath?: string): Promise<void>;

    /**
     * Change the layout algorithm
     */
    setLayout(layout: LayoutType): void;

    /**
     * Switch visualization layer
     */
    setLayer(layer: Layer): void;

    /**
     * Export graph data
     */
    exportGraph(): Promise<void>;

    /**
     * Get the renderer name/type
     */
    getRendererType(): 'cytoscape';

    /**
     * Get current node count
     */
    getNodeCount(): number;
}














