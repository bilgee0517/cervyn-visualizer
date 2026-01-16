/**
 * Webview script for the codebase visualizer
 * Main entry point - coordinates all modules
 */

import { CytoscapeCore } from './cytoscape/cytoscape-core';
import { logMessage } from './shared/utils';
import { withErrorBoundary, safeMessageHandler } from './shared/error-boundary';

(function() {
    'use strict';

    const vscode = acquireVsCodeApi();
    let cytoscapeCore: CytoscapeCore;

    /**
     * Initialize the Cytoscape controller
     */
    function initialize() {
        logMessage(vscode, '[main.ts] Initializing CytoscapeCore...');
        cytoscapeCore = new CytoscapeCore(vscode);
        logMessage(vscode, '[main.ts] ✓ CytoscapeCore initialized');
    }

    /**
     * Handle messages from extension with error boundaries
     */
    window.addEventListener('message', event => {
        const message = event.data;
        logMessage(vscode, `[main.ts] Received message: ${message.type}`);
        
        // Wrap entire message handling in error boundary
        withErrorBoundary(() => {
                switch (message.type) {
                case 'init':
                    safeMessageHandler('init', () => {
                        logMessage(vscode, '[main.ts] Received init config');
                        
                        // Set configuration
                        cytoscapeCore.setConfig(message.cytoscapeStyles, message.getLayoutConfig);
                        
                        // Initialize Cytoscape
                        logMessage(vscode, '[main.ts] Calling initCytoscape()...');
                        cytoscapeCore.initCytoscape();
                        logMessage(vscode, '[main.ts] ✓ initCytoscape() returned');
                        
                        // Signal ready
                        logMessage(vscode, '[main.ts] Sending ready signal...');
                        vscode.postMessage({ type: 'ready' });
                        logMessage(vscode, '[main.ts] ✓ Ready signal sent');
                    }, vscode);
                    break;
                
                case 'updateGraph':
                    safeMessageHandler('updateGraph', () => {
                        logMessage(vscode, `[main.ts] updateGraph: ${message.graph?.nodes?.length || 0} nodes`);
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.updateGraph(message.graph, message.layout, message.activeFilePath, message.newlyAddedNodeIds);
                        } else {
                            logMessage(vscode, '[main.ts] Config not ready, queuing graph update');
                            setTimeout(() => {
                                withErrorBoundary(() => {
                                    if (cytoscapeCore.isReady()) {
                                        cytoscapeCore.updateGraph(message.graph, message.layout, message.activeFilePath, message.newlyAddedNodeIds);
                                    }
                                }, { operation: 'Queued graph update' }, vscode);
                            }, 100);
                        }
                    }, vscode);
                    break;
                
                case 'updateGraphIncremental':
                    safeMessageHandler('updateGraphIncremental', () => {
                        logMessage(vscode, `[main.ts] ========== updateGraphIncremental handler START ==========`);
                        logMessage(vscode, `  - Added nodes: ${message.addedNodes?.length || 0}`);
                        logMessage(vscode, `  - Added edges: ${message.addedEdges?.length || 0}`);
                        logMessage(vscode, `  - Removed node IDs: ${message.removedNodeIds?.length || 0}`);
                        logMessage(vscode, `  - Has full graph: ${!!message.fullGraph}`);
                        logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                        logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                        
                        if (cytoscapeCore && cytoscapeCore.isReady()) {
                            logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateGraphIncremental...');
                            cytoscapeCore.updateGraphIncremental(
                                message.addedNodes || [],
                                message.addedEdges || [],
                                message.removedNodeIds || [],
                                message.fullGraph,
                                message.newlyAddedNodeIds
                            );
                            logMessage(vscode, '[main.ts] ✓ updateGraphIncremental call completed');
                        } else {
                            logMessage(vscode, '[main.ts] ⚠️  Config not ready, falling back to full update');
                            if (message.fullGraph) {
                                logMessage(vscode, '[main.ts] Scheduling full update fallback...');
                                setTimeout(() => {
                                    withErrorBoundary(() => {
                                        if (cytoscapeCore && cytoscapeCore.isReady()) {
                                            logMessage(vscode, '[main.ts] Executing full update fallback...');
                                            cytoscapeCore.updateGraph(message.fullGraph, message.layout, message.activeFilePath);
                                            logMessage(vscode, '[main.ts] ✓ Full update fallback completed');
                                        } else {
                                            logMessage(vscode, '[main.ts] Still not ready after timeout');
                                        }
                                    }, { operation: 'Full update fallback' }, vscode);
                                }, 100);
                            } else {
                                logMessage(vscode, '[main.ts] ⚠️  No full graph provided for fallback');
                            }
                        }
                        logMessage(vscode, `[main.ts] ========== updateGraphIncremental handler END ==========`);
                    }, vscode);
                    break;
                
                case 'updateNodeProperties':
                    safeMessageHandler('updateNodeProperties', () => {
                        logMessage(vscode, `[main.ts] ========== updateNodeProperties handler START ==========`);
                        logMessage(vscode, `  - Updates count: ${message.updates?.length || 0}`);
                        logMessage(vscode, `  - Layer: ${message.layer || 'unknown'}`);
                        logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                        logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                        
                        if (cytoscapeCore && cytoscapeCore.isReady()) {
                            logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateNodeProperties...');
                            cytoscapeCore.updateNodeProperties(message.updates || []);
                            logMessage(vscode, '[main.ts] ✓ updateNodeProperties call completed');
                        } else {
                            logMessage(vscode, '[main.ts] ⚠️  CytoscapeCore not ready, skipping property update');
                        }
                        logMessage(vscode, `[main.ts] ========== updateNodeProperties handler END ==========`);
                    }, vscode);
                    break;
                
                case 'updateEdgeProperties':
                    safeMessageHandler('updateEdgeProperties', () => {
                        logMessage(vscode, `[main.ts] ========== updateEdgeProperties handler START ==========`);
                        logMessage(vscode, `  - Updates count: ${message.updates?.length || 0}`);
                        logMessage(vscode, `  - Layer: ${message.layer || 'unknown'}`);
                        logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                        logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                        
                        if (cytoscapeCore && cytoscapeCore.isReady()) {
                            logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateEdgeProperties...');
                            cytoscapeCore.updateEdgeProperties(message.updates || []);
                            logMessage(vscode, '[main.ts] ✓ updateEdgeProperties call completed');
                        } else {
                            logMessage(vscode, '[main.ts] ⚠️  CytoscapeCore not ready, skipping property update');
                        }
                        logMessage(vscode, `[main.ts] ========== updateEdgeProperties handler END ==========`);
                    }, vscode);
                    break;
                
                case 'setLayout':
                    safeMessageHandler('setLayout', () => {
                        cytoscapeCore.setLayout(message.layout);
                    }, vscode);
                    break;
                
                case 'focusOnNode':
                    safeMessageHandler('focusOnNode', () => {
                        const nodeId = message.nodeId;
                        const options = message.options || {};
                        if (nodeId && cytoscapeCore) {
                            const success = cytoscapeCore.focusOnNode(nodeId, options);
                            vscode.postMessage({ 
                                type: 'focusResult', 
                                success, 
                                nodeId 
                            });
                        }
                    }, vscode);
                    break;
            
                case 'searchNodes':
                    safeMessageHandler('searchNodes', () => {
                        const query = message.query;
                        const maxResults = message.maxResults || 20;
                        if (query && cytoscapeCore) {
                            const results = cytoscapeCore.searchNodes(query, maxResults);
                            vscode.postMessage({ 
                                type: 'searchResults', 
                                results 
                            });
                        }
                    }, vscode);
                    break;
                
                case 'focusOnSearch':
                    safeMessageHandler('focusOnSearch', () => {
                        const query = message.query;
                        const options = message.options || {};
                        if (query && cytoscapeCore) {
                            const success = cytoscapeCore.focusOnSearch(query, options);
                            vscode.postMessage({ 
                                type: 'focusResult', 
                                success, 
                                query 
                            });
                        }
                    }, vscode);
                    break;
                
                case 'addNode':
                    safeMessageHandler('addNode', () => {
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.addNode(message.nodeData);
                        } else {
                            logMessage(vscode, '[main.ts] Not ready for addNode, ignoring');
                        }
                    }, vscode);
                    break;
                
                case 'removeNode':
                    safeMessageHandler('removeNode', () => {
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.removeNode(message.nodeId);
                        } else {
                            logMessage(vscode, '[main.ts] Not ready for removeNode, ignoring');
                        }
                    }, vscode);
                    break;
                
                case 'addNodesBatch':
                    safeMessageHandler('addNodesBatch', () => {
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.addNodesBatch(message.nodesData);
                        } else {
                            logMessage(vscode, '[main.ts] Not ready for addNodesBatch, ignoring');
                        }
                    }, vscode);
                    break;
                
                case 'addEdge':
                    safeMessageHandler('addEdge', () => {
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.addEdge(message.edgeData);
                        } else {
                            logMessage(vscode, '[main.ts] Not ready for addEdge, ignoring');
                        }
                    }, vscode);
                    break;
                
                default:
                    logMessage(vscode, `[main.ts] Unknown message type: ${message.type}`);
                    break;
            }
        }, { operation: 'Message handler', messageType: message.type }, vscode);
    });

    /**
     * Wait for Cytoscape library to load
     */
    function waitForCytoscape() {
        logMessage(vscode, `[main.ts] waitForCytoscape() called, cytoscape exists: ${typeof cytoscape !== 'undefined'}`);
        
        if (typeof cytoscape !== 'undefined') {
            logMessage(vscode, '[main.ts] ✓ Cytoscape library loaded, requesting config...');
            vscode.postMessage({ type: 'requestInit' });
            logMessage(vscode, '[main.ts] ✓ requestInit message sent');
        } else {
            logMessage(vscode, '[main.ts] Waiting for Cytoscape library...');
            setTimeout(waitForCytoscape, 100);
        }
    }

    /**
     * Initialize when DOM and libraries are ready
     */
    logMessage(vscode, `[main.ts] Script loaded, document.readyState: ${document.readyState}`);
    
    // Initialize the core first
    initialize();
    
    if (document.readyState === 'loading') {
        logMessage(vscode, '[main.ts] Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
            logMessage(vscode, '[main.ts] DOM loaded, checking for Cytoscape...');
            waitForCytoscape();
        });
    } else {
        logMessage(vscode, '[main.ts] DOM already loaded, checking for Cytoscape...');
        waitForCytoscape();
    }
})();
