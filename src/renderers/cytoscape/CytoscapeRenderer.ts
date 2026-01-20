import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { GraphService } from '../../services/GraphService';
import { CodeAnalyzer } from '../../services/CodeAnalyzer';
import { GraphData, GraphNode, GraphEdge, Layer, LayoutType } from '../../types';
import { log } from '../../logger';
import { IGraphRenderer } from '../IGraphRenderer';
import { CYTOSCAPE_STYLES } from '../../config/cytoscape-styles';
import { getLayoutConfig } from '../../config/layout-config';
import { WebviewError, FileSystemError } from '../../errors';
import { handleError, errorBoundary, generateCorrelationId } from '../../utils/error-handler';
import { createWebviewStatePersistence, WebviewStatePersistence } from '../../services/WebviewStatePersistence';

/**
 * Cytoscape.js-based graph renderer
 * Best for small to medium graphs (<500 nodes) with rich interactions and compound nodes
 */
export class CytoscapeRenderer implements IGraphRenderer {
    private _view?: vscode.WebviewView;
    private currentLayout: LayoutType = 'fcose';
    private currentLayer: Layer = 'code';
    private previousGraphNodeIds: Set<string> = new Set(); // Track previous graph state to detect newly added nodes from StateSync
    private webviewState: WebviewStatePersistence;
    private context?: vscode.ExtensionContext;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly graphService: GraphService,
        private readonly codeAnalyzer: CodeAnalyzer,
        context?: vscode.ExtensionContext
    ) {
        // Initialize webview state persistence
        this.webviewState = createWebviewStatePersistence();
        this.context = context;
        // Listen for external state changes (from MCP server) and refresh webview
        // Note: This is now only used for initial loads or internal changes
        // External structural changes use onGraphChangedIncremental to preserve zoom/state
        this.graphService.onGraphChanged(() => {
            log('[CytoscapeRenderer] Graph changed (full refresh), refreshing webview...');
            this.updateWebview(false); // false = not from StateSync incremental update
        });
        
        // Listen for incremental structural changes (from MCP server) - preserves zoom/state
        this.graphService.onGraphChangedIncremental(({ layer, addedNodes, addedEdges, removedNodeIds, fullGraph }) => {
            log(`[CytoscapeRenderer] Incremental structural change detected for ${layer} layer`);
            if (layer === this.currentLayer) {
                // Create removed node objects (we only have IDs, so create minimal node objects)
                // The actual node data isn't needed for removal - just the IDs
                const removedNodes: GraphNode[] = removedNodeIds.map(id => ({
                    data: { id } as any
                }));
                
                // Create changedGraph with only added nodes/edges
                const changedGraph: GraphData = {
                    nodes: addedNodes,
                    edges: addedEdges
                };
                
                this.updateWebviewIncremental(fullGraph, changedGraph, removedNodes);
            }
        });
        
        // Listen for property-only updates (efficient in-place updates)
        this.graphService.onNodePropertiesChanged(({ layer, nodeUpdates }) => {
            log(`[CytoscapeRenderer] Node properties changed externally for ${nodeUpdates.size} nodes in ${layer} layer`);
            if (layer === this.currentLayer) {
                this.updateNodeProperties(nodeUpdates);
            }
        });
        
        // Listen for property-only edge updates (efficient in-place updates)
        this.graphService.onEdgePropertiesChanged(({ layer, edgeUpdates }) => {
            log(`[CytoscapeRenderer] Edge properties changed externally for ${edgeUpdates.size} edges in ${layer} layer`);
            if (layer === this.currentLayer) {
                this.updateEdgeProperties(edgeUpdates);
            }
        });
    }

    public getRendererType(): 'cytoscape' {
        return 'cytoscape';
    }

    public getNodeCount(): number {
        const graphData = this.graphService.getGraph(this.currentLayer);
        return graphData.nodes.length;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.WebviewViewResolveContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ) {
        log('[CytoscapeRenderer] resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        log('[CytoscapeRenderer] HTML set on webview');

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            log(`[CytoscapeRenderer] Received message: ${data.type}`);
            switch (data.type) {
                case 'requestInit': {
                    // Webview is requesting initialization config
                    log('[CytoscapeRenderer] Webview requested init, sending config...');
                    this.sendInitConfig();
                    break;
                }
                case 'ready': {
                    // Webview is ready (config received and Cytoscape initialized)
                    log('[CytoscapeRenderer] Webview ready, checking for data...');
                    
                    // Try to restore previous webview state from extension context
                    if (this.context) {
                        const savedState = this.context.workspaceState.get<string>('codebaseVisualizer.webviewState');
                        if (savedState) {
                            log('[CytoscapeRenderer] Restoring previous webview state...');
                            this.webviewState.deserialize(savedState);
                        }
                    }
                    
                    const graphData = this.graphService.getGraph(this.currentLayer);
                    if (graphData.nodes.length === 0) {
                        log('[CytoscapeRenderer] No data yet, triggering refresh...');
                        this.refresh();
                    } else {
                        log('[CytoscapeRenderer] Data exists, sending to webview...');
                        this.updateWebview(false); // false = not from StateSync
                    }
                    break;
                }
                case 'stateChanged': {
                    // Webview state changed (zoom, pan, etc.)
                    if (data.state) {
                        this.webviewState.updateState(data.state);
                        // Persist to extension workspace state
                        if (this.context) {
                            this.context.workspaceState.update(
                                'codebaseVisualizer.webviewState',
                                this.webviewState.serialize()
                            );
                        }
                        log('[CytoscapeRenderer] Webview state persisted', () => ({
                            zoom: data.state.zoom,
                            pan: data.state.pan
                        }));
                    }
                    break;
                }
                case 'openFile': {
                    if (data.path) {
                        const uri = vscode.Uri.file(data.path);
                        await vscode.window.showTextDocument(uri);
                    }
                    break;
                }
                case 'alert': {
                    vscode.window.showInformationMessage(data.message);
                    break;
                }
                case 'error': {
                    vscode.window.showErrorMessage(data.message);
                    break;
                }
                case 'log': {
                    // Log messages from webview to VS Code output
                    log(`[Webview] ${data.message}`);
                    break;
                }
                case 'refreshGraph': {
                    // User requested full graph refresh (clears all state)
                    log('[CytoscapeRenderer] Refresh graph requested, executing command...');
                    (async () => {
                        try {
                            await vscode.commands.executeCommand('codebaseVisualizer.refreshGraph');
                            log('[CytoscapeRenderer] Refresh graph command executed successfully');
                        } catch (error: any) {
                            log(`[CytoscapeRenderer] Error executing refresh command: ${error}`);
                            vscode.window.showErrorMessage(`Failed to refresh graph: ${error}`);
                        }
                    })();
                    break;
                }
                case 'changeLayer': {
                    // User changed layer via dropdown in webview
                    if (data.layer) {
                        log(`[CytoscapeRenderer] Layer change requested from webview: ${data.layer}`);
                        this.setLayer(data.layer);
                    }
                    break;
                }
            }
        });
    }

    public show() {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    /**
     * Send initialization config to webview
     * This includes styles and layout configuration
     */
    private sendInitConfig() {
        if (!this._view) {
            log('[CytoscapeRenderer] Cannot send init config - _view is null');
            return;
        }

        log('[CytoscapeRenderer] Sending init config to webview...');
        log(`[CytoscapeRenderer] CYTOSCAPE_STYLES type: ${typeof CYTOSCAPE_STYLES}, is array: ${Array.isArray(CYTOSCAPE_STYLES)}, length: ${CYTOSCAPE_STYLES?.length || 0}`);
        log(`[CytoscapeRenderer] getLayoutConfig type: ${typeof getLayoutConfig}`);
        
        const configMessage = {
            type: 'init',
            cytoscapeStyles: CYTOSCAPE_STYLES,
            getLayoutConfig: getLayoutConfig.toString()
        };
        
        log(`[CytoscapeRenderer] Message payload size: ${JSON.stringify(configMessage).length} chars`);
        this._view.webview.postMessage(configMessage);
        log('[CytoscapeRenderer] ✓ Init config sent');
    }

    public async refresh(changedFilePath?: string) {
        try {
            const existingGraph = this.graphService.getGraph(this.currentLayer);
            const hasExistingGraph = existingGraph.nodes.length > 0;
            
            // Use incremental update if we have a file path and existing graph
            if (changedFilePath && hasExistingGraph) {
                await this.refreshIncremental(changedFilePath, existingGraph);
                return;
            }
            
            // Full refresh
            log(`\n[CytoscapeRenderer] Starting full refresh for layer: ${this.currentLayer}`);
            vscode.window.showInformationMessage(`Analyzing codebase (${this.currentLayer} layer)...`);
            
            // Get existing graph to preserve agent-added nodes
            const agentAddedNodes = existingGraph.nodes.filter(n => n.data.isAgentAdded === true);
            const agentAddedEdges = existingGraph.edges.filter(e => {
                // Keep edges where both source and target are agent-added nodes
                const agentNodeIds = new Set(agentAddedNodes.map(n => n.data.id));
                return agentNodeIds.has(e.data.source) && agentNodeIds.has(e.data.target);
            });
            
            log(`[CytoscapeRenderer] Preserving ${agentAddedNodes.length} agent-added nodes and ${agentAddedEdges.length} agent-added edges`);
            
            // Analyze codebase and regenerate graph
            const graphData = await this.codeAnalyzer.analyzeWorkspace(this.currentLayer);
            
            // Merge: codebase nodes + agent-added nodes (avoiding duplicates by ID)
            const codebaseNodeIds = new Set(graphData.nodes.map(n => n.data.id));
            const mergedNodes = [
                ...graphData.nodes,
                ...agentAddedNodes.filter(n => !codebaseNodeIds.has(n.data.id))
            ];
            
            const codebaseEdgeIds = new Set(graphData.edges.map(e => e.data.id));
            const mergedEdges = [
                ...graphData.edges,
                ...agentAddedEdges.filter(e => !codebaseEdgeIds.has(e.data.id))
            ];
            
            const mergedGraph: GraphData = {
                nodes: mergedNodes,
                edges: mergedEdges
            };
            
            log(`[CytoscapeRenderer] Analysis complete. Found ${graphData.nodes.length} codebase nodes, merged total: ${mergedGraph.nodes.length} nodes, ${mergedGraph.edges.length} edges`);
            
            if (mergedGraph.nodes.length === 0) {
                log('[CytoscapeRenderer] WARNING: No files found to visualize');
                vscode.window.showWarningMessage('No files found to visualize. Check the Output panel for details.');
            } else {
                log('[CytoscapeRenderer] SUCCESS: Graph generated');
                vscode.window.showInformationMessage(`Graph generated: ${mergedGraph.nodes.length} nodes, ${mergedGraph.edges.length} edges (Cytoscape)`);
            }
            
            this.graphService.setGraph(mergedGraph, this.currentLayer);
            this.updateWebview(false); // false = not from StateSync
        } catch (error) {
            log(`[CytoscapeRenderer] ERROR during refresh: ${error}`);
            console.error('[CytoscapeRenderer] Error during refresh:', error);
            vscode.window.showErrorMessage(`Failed to generate graph: ${error}`);
        }
    }

    /**
     * Incremental refresh - only analyze the changed file and update graph
     */
    private async refreshIncremental(changedFilePath: string, existingGraph: GraphData) {
        try {
            log(`\n[CytoscapeRenderer] Starting incremental refresh for: ${changedFilePath}`);
            
            // Check if file exists (it may have been deleted)
            if (!fs.existsSync(changedFilePath)) {
                log(`[CytoscapeRenderer] File does not exist (deleted): ${changedFilePath}`);
                // Remove nodes for deleted file
                this.graphService.removeNodesForFile(changedFilePath, this.currentLayer);
                return; // GraphService will fire incremental change event
            }
            
            // Analyze only the changed file
            const fileGraphData = await this.codeAnalyzer.analyzeFileIncremental(
                changedFilePath,
                this.currentLayer,
                existingGraph
            );
            
            if (fileGraphData.nodes.length === 0 && fileGraphData.edges.length === 0) {
                log(`[CytoscapeRenderer] No changes detected for ${changedFilePath}`);
                return;
            }
            
            // Preserve agent-added nodes
            const agentAddedNodes = existingGraph.nodes.filter(n => n.data.isAgentAdded === true);
            const agentAddedEdges = existingGraph.edges.filter(e => {
                const agentNodeIds = new Set(agentAddedNodes.map(n => n.data.id));
                return agentNodeIds.has(e.data.source) && agentNodeIds.has(e.data.target);
            });
            
            // Find the file node ID from the new graph data
            const fileNode = fileGraphData.nodes.find(n => n.data.type === 'file' && n.data.path === changedFilePath);
            const fileNodeId = fileNode?.data.id;
            
            // Find all nodes related to this file (file node + its children like classes/functions)
            const nodesToRemove = existingGraph.nodes.filter(n => {
                // Remove file node and any nodes that are children of this file
                return n.data.path === changedFilePath || 
                       (fileNodeId && n.data.parent === fileNodeId);
            });
            const nodeIdsToRemove = new Set(nodesToRemove.map(n => n.data.id));
            
            // Remove edges connected to removed nodes
            const edgesToRemove = existingGraph.edges.filter(e => 
                nodeIdsToRemove.has(e.data.source) || nodeIdsToRemove.has(e.data.target)
            );
            
            // Build new graph: existing - removed + new + agent-added
            // First, get the set of existing node IDs (after removal) to deduplicate
            const remainingExistingNodes = existingGraph.nodes.filter(n => !nodeIdsToRemove.has(n.data.id));
            const existingNodeIds = new Set(remainingExistingNodes.map(n => n.data.id));
            const existingEdgeIds = new Set(existingGraph.edges.map(e => e.data.id));
            
            // Filter out nodes from fileGraphData that already exist (to prevent duplicates)
            // This is important because analyzeFileIncremental creates folder nodes that may already exist
            const newNodesFromFile = fileGraphData.nodes.filter(n => !existingNodeIds.has(n.data.id));
            
            const updatedNodes = [
                ...remainingExistingNodes,
                ...newNodesFromFile,
                ...agentAddedNodes.filter(n => !existingNodeIds.has(n.data.id))
            ];
            
            // Filter out edges from fileGraphData that already exist
            const newEdgesFromFile = fileGraphData.edges.filter(e => {
                const edgeId = e.data.id;
                return !existingEdgeIds.has(edgeId);
            });
            
            const updatedEdges = [
                ...existingGraph.edges.filter(e => {
                    const edgeId = e.data.id;
                    return !edgesToRemove.some(removed => removed.data.id === edgeId);
                }),
                ...newEdgesFromFile,
                ...agentAddedEdges.filter(e => !existingEdgeIds.has(e.data.id))
            ];
            
            const updatedGraph: GraphData = {
                nodes: updatedNodes,
                edges: updatedEdges
            };
            
            log(`[CytoscapeRenderer] Incremental update: removed ${nodesToRemove.length} nodes, fileGraphData has ${fileGraphData.nodes.length} nodes (${newNodesFromFile.length} new after deduplication), total: ${updatedNodes.length} nodes`);
            
            // Update previous graph state
            this.previousGraphNodeIds = new Set(updatedNodes.map(n => n.data.id));
            
            this.graphService.setGraph(updatedGraph, this.currentLayer);
            this.updateWebviewIncremental(updatedGraph, fileGraphData, nodesToRemove);
        } catch (err) {
            const error = new WebviewError(
                'Failed to perform incremental graph update',
                'updateGraphIncremental',
                'extension_to_webview',
                { 
                    layer: this.currentLayer,
                    changedFilePath
                },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'incremental graph refresh',
                component: 'CytoscapeRenderer',
                metadata: { layer: this.currentLayer, willFallback: true, changedFilePath }
            });
            // Fall back to full refresh on error
            await this.refresh();
        }
    }

    public setLayout(layout: LayoutType) {
        this.currentLayout = layout;
        this.webviewState.setLayout(layout);
        
        // Persist to extension workspace state
        if (this.context) {
            this.context.workspaceState.update(
                'codebaseVisualizer.webviewState',
                this.webviewState.serialize()
            );
        }
        
        this._view?.webview.postMessage({
            type: 'setLayout',
            layout: layout
        });
    }

    public setLayer(layer: Layer) {
        this.currentLayer = layer;
        this.graphService.setCurrentLayer(layer);
        this.webviewState.setLayer(layer);
        
        // Persist to extension workspace state
        if (this.context) {
            this.context.workspaceState.update(
                'codebaseVisualizer.webviewState',
                this.webviewState.serialize()
            );
        }
        
        // Notify webview of layer change (updates dropdown if changed externally)
        this._view?.webview.postMessage({
            type: 'layerChanged',
            layer: layer
        });
        
        this.updateWebview(false); // false = not from StateSync
    }

    public async exportGraph() {
        const graphData = this.graphService.getGraph(this.currentLayer);
        const json = JSON.stringify(graphData, null, 2);
        
        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON': ['json'] },
            defaultUri: vscode.Uri.file(`graph-${this.currentLayer}.json`)
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
            vscode.window.showInformationMessage('Graph exported successfully');
        }
    }

    private updateWebview(fromStateSync: boolean = false) {
        if (this._view) {
            const graphData = this.graphService.getGraph(this.currentLayer);
            
            // Get active file for context-aware focused view
            const activeEditor = vscode.window.activeTextEditor;
            const activeFilePath = activeEditor?.document.uri.fsPath;
            
            // Detect newly added nodes when update is from StateSync
            const newlyAddedNodeIds: string[] = [];
            log(`[CytoscapeRenderer] updateWebview called - fromStateSync: ${fromStateSync}, previousGraphNodeIds.size: ${this.previousGraphNodeIds.size}, current nodes: ${graphData.nodes.length}`);
            if (fromStateSync && this.previousGraphNodeIds.size > 0) {
                const currentNodeIds = new Set(graphData.nodes.map(n => n.data.id));
                newlyAddedNodeIds.push(...Array.from(currentNodeIds).filter(id => !this.previousGraphNodeIds.has(id)));
                log(`[CytoscapeRenderer] StateSync update: detected ${newlyAddedNodeIds.length} newly added nodes`);
                if (newlyAddedNodeIds.length > 0) {
                    log(`[CytoscapeRenderer] Newly added node IDs: ${newlyAddedNodeIds.slice(0, 10).join(', ')}${newlyAddedNodeIds.length > 10 ? '...' : ''}`);
                }
            } else if (fromStateSync && this.previousGraphNodeIds.size === 0) {
                log(`[CytoscapeRenderer] StateSync update: previousGraphNodeIds is empty, initializing state (won't detect newly added nodes this time)`);
            }
            
            // Update previous graph state (always, even if fromStateSync is false)
            this.previousGraphNodeIds = new Set(graphData.nodes.map(n => n.data.id));
            
            log(`[CytoscapeRenderer] Sending updateGraph: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
            if (fromStateSync && newlyAddedNodeIds.length > 0) {
                log(`[CytoscapeRenderer] Newly added node IDs: ${newlyAddedNodeIds.slice(0, 10).join(', ')}${newlyAddedNodeIds.length > 10 ? '...' : ''}`);
            }
            log(`[CytoscapeRenderer] Active file: ${activeFilePath || 'none'}`);
            
            // Include persisted webview state in the update
            const persistedState = this.webviewState.getState();
            
            this._view.webview.postMessage({
                type: 'updateGraph',
                graph: graphData,
                layout: this.currentLayout,
                layer: this.currentLayer,
                activeFilePath: activeFilePath,
                newlyAddedNodeIds: fromStateSync ? newlyAddedNodeIds : undefined,
                persistedState: persistedState // Include persisted zoom/pan state
            });
        } else {
            log('[CytoscapeRenderer] Cannot update webview - _view is null');
        }
    }

    /**
     * Send incremental update to webview (only changed nodes/edges)
     */
    private updateWebviewIncremental(
        fullGraph: GraphData,
        changedGraph: GraphData,
        removedNodes: GraphNode[]
    ) {
        if (this._view) {
            const activeEditor = vscode.window.activeTextEditor;
            const activeFilePath = activeEditor?.document.uri.fsPath;
            
            // Extract newly added node IDs for selection
            const newlyAddedNodeIds = changedGraph.nodes.map(n => n.data.id);
            
            log(`[CytoscapeRenderer] Sending incremental update: +${changedGraph.nodes.length} nodes, -${removedNodes.length} nodes`);
            if (newlyAddedNodeIds.length > 0) {
                log(`[CytoscapeRenderer] Newly added node IDs for selection: ${newlyAddedNodeIds.slice(0, 10).join(', ')}${newlyAddedNodeIds.length > 10 ? '...' : ''}`);
            }
            
            this._view.webview.postMessage({
                type: 'updateGraphIncremental',
                addedNodes: changedGraph.nodes,
                addedEdges: changedGraph.edges,
                removedNodeIds: removedNodes.map(n => n.data.id),
                fullGraph: fullGraph, // Send full graph for reference
                layout: this.currentLayout,
                layer: this.currentLayer,
                activeFilePath: activeFilePath,
                newlyAddedNodeIds: newlyAddedNodeIds.length > 0 ? newlyAddedNodeIds : undefined
            });
        } else {
            log('[CytoscapeRenderer] Cannot update webview - _view is null');
        }
    }

    /**
     * Send property-only update to webview (efficient in-place node data updates)
     */
    private updateNodeProperties(nodeUpdates: Map<string, Partial<GraphNode['data']>>): void {
        if (!this._view) {
            log('[CytoscapeRenderer] Cannot update node properties - _view is null');
            return;
        }

        // Convert Map to array of { nodeId, updates } objects
        const updates: Array<{ nodeId: string; updates: Partial<GraphNode['data']> }> = [];
        for (const [nodeId, updateData] of nodeUpdates.entries()) {
            updates.push({ nodeId, updates: updateData });
        }

        log(`[CytoscapeRenderer] Sending property-only update for ${updates.length} nodes`);
        
        this._view.webview.postMessage({
            type: 'updateNodeProperties',
            updates: updates,
            layer: this.currentLayer
        });
    }

    /**
     * Send property-only update to webview for edges (efficient in-place edge data updates)
     */
    private updateEdgeProperties(edgeUpdates: Map<string, Partial<GraphEdge['data']>>): void {
        if (!this._view) {
            log('[CytoscapeRenderer] Cannot update edge properties - _view is null');
            return;
        }

        // Convert Map to array of { edgeId, updates } objects
        const updates: Array<{ edgeId: string; updates: Partial<GraphEdge['data']> }> = [];
        for (const [edgeId, updateData] of edgeUpdates.entries()) {
            updates.push({ edgeId, updates: updateData });
        }

        log(`[CytoscapeRenderer] Sending property-only update for ${updates.length} edges`);
        
        this._view.webview.postMessage({
            type: 'updateEdgeProperties',
            updates: updates,
            layer: this.currentLayer
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'cytoscape.html');
        
        // Load Cytoscape-specific HTML template
        let html = fs.readFileSync(htmlPath, 'utf-8');
        
        // External library URIs (CDN)
        const cytoscapeUri = 'https://unpkg.com/cytoscape@3.29.0/dist/cytoscape.min.js';
        const dagreUri = 'https://unpkg.com/dagre@0.8.5/dist/dagre.min.js';
        const cytoscapeDagreUri = 'https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js';
        
        // fCoSE and its dependencies
        const layoutBaseUri = 'https://unpkg.com/layout-base@2.0.1/layout-base.js';
        const coseBaseUri = 'https://unpkg.com/cose-base@2.2.0/cose-base.js';
        const cytoscapeFcoseUri = 'https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js';
        
        // Expand-collapse extension for zoom-based LOD
        const cytoscapeExpandCollapseUri = 'https://unpkg.com/cytoscape-expand-collapse@4.1.0/cytoscape-expand-collapse.js';
        
        // Local compiled script and styles
        const mainScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'styles.css')
        );
        
        log(`[CytoscapeRenderer] mainScriptUri: ${mainScriptUri.toString()}`);
        
        // Replace HTML placeholders
        html = html.replaceAll('{{cspSource}}', webview.cspSource);
        html = html.replaceAll('{{nonce}}', nonce);
        html = html.replaceAll('{{rendererName}}', 'CYTOSCAPE');
        html = html.replaceAll('{{cytoscapeUri}}', cytoscapeUri);
        html = html.replaceAll('{{dagreUri}}', dagreUri);
        html = html.replaceAll('{{cytoscapeDagreUri}}', cytoscapeDagreUri);
        html = html.replaceAll('{{layoutBaseUri}}', layoutBaseUri);
        html = html.replaceAll('{{coseBaseUri}}', coseBaseUri);
        html = html.replaceAll('{{cytoscapeFcoseUri}}', cytoscapeFcoseUri);
        html = html.replaceAll('{{cytoscapeExpandCollapseUri}}', cytoscapeExpandCollapseUri);
        html = html.replaceAll('{{mainScriptUri}}', mainScriptUri.toString());
        html = html.replaceAll('{{styleUri}}', styleUri.toString());
        
        log('[CytoscapeRenderer] ✓ HTML template prepared (clean, no inline injection)');
        return html;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
