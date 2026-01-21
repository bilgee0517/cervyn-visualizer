/**
 * ============================================================================
 * Event handlers for Cytoscape interactions
 * ============================================================================
 * Handles node clicks, mouse events, edge interactions, etc.
 * Uses centralized spacing, typography, and color systems.
 * ============================================================================
 */

import { CONFIG } from '../shared/types';
import { StateManager } from '../shared/state-manager';
import { COLORS } from '../../config/colors';
import { BORDERS, OPACITY, Z_INDEX } from '../../config/spacing';
import { StyleManager, StyleLayer } from './style-manager';

export class InteractionHandlers {
    private vscode: any;
    private stateManager: StateManager;
    private tooltipTimer: any = null;
    private hideTooltipTimer: any = null;
    private currentMousePosition: { x: number; y: number } | null = null;
    private cameraManager: any = null; // Will be set after CameraManager is initialized
    private styleManager?: StyleManager; // Will be set after StyleManager is initialized
    private focusOnClick: boolean = false; // Option to focus on node click
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
    }
    
    /**
     * Set CameraManager instance (called after initialization)
     */
    public setCameraManager(cameraManager: any): void {
        this.cameraManager = cameraManager;
    }
    
    /**
     * Set StyleManager instance (called after initialization)
     */
    public setStyleManager(styleManager: StyleManager): void {
        this.styleManager = styleManager;
    }
    
    /**
     * Enable or disable focus on click
     */
    public setFocusOnClick(enabled: boolean): void {
        this.focusOnClick = enabled;
    }
    
    /**
     * Register all event handlers
     */
    registerHandlers(): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        cy.on('tap', 'node', (evt: any) => this.handleNodeClick(evt));
        cy.on('mouseover', 'node', (evt: any) => this.handleNodeMouseOver(evt));
        cy.on('mouseout', 'node', (evt: any) => this.handleNodeMouseOut(evt));
        cy.on('mouseover', 'edge', (evt: any) => this.handleEdgeMouseOver(evt));
        cy.on('mouseout', 'edge', (evt: any) => this.handleEdgeMouseOut(evt));
        
        // Right-click to show tooltip (cxttap is Cytoscape's right-click event)
        cy.on('cxttap', 'node', (evt: any) => this.handleNodeRightClick(evt));
        cy.on('cxttap', 'edge', (evt: any) => this.handleEdgeRightClick(evt));
        
        // Track mouse position for tooltip positioning
        cy.on('mousemove', (evt: any) => this.handleMouseMove(evt));
        
        // Handle clicks on background (empty space) to clear selection and hide tooltip
        cy.on('tap', (evt: any) => {
            this.handleBackgroundClick(evt);
            // Also hide tooltip when clicking on background
            this.clearTooltip();
        });
        
        // Hide tooltip when right-clicking on background
        cy.on('cxttap', (evt: any) => {
            const target = evt.target;
            if (target === cy) {
                this.clearTooltip();
            }
        });
        
        // Hide tooltip on ESC key press
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.clearTooltip();
            }
        });
        
        // Hide tooltip when mouse leaves the viewport
        this.setupViewportLeaveHandler(cy);
    }
    
    /**
     * Track mouse position for tooltip positioning
     */
    private handleMouseMove(evt: any): void {
        if (evt && evt.renderedPosition) {
            this.currentMousePosition = {
                x: evt.renderedPosition.x,
                y: evt.renderedPosition.y
            };
        }
    }
    
    /**
     * Setup handler to hide tooltip when mouse leaves the viewport
     */
    private setupViewportLeaveHandler(cy: any): void {
        // Get the Cytoscape container element
        const container = cy.container();
        if (!container) return;
        
        // Hide tooltip when mouse leaves the container
        // This is the primary handler - when mouse leaves the Cytoscape canvas
        container.addEventListener('mouseleave', (e: MouseEvent) => {
            // Only clear if mouse actually left (not just moving to a child element)
            if (!container.contains(e.relatedTarget as Node)) {
                this.clearTooltip();
            }
        });
        
        // Also listen for mouseout on document to catch when mouse leaves the entire page
        // This handles cases where mouse goes to browser UI, dev tools, etc.
        document.addEventListener('mouseout', (e: MouseEvent) => {
            // If relatedTarget is null, mouse left the document entirely
            if (!e.relatedTarget) {
                this.clearTooltip();
            }
        });
    }
    
    /**
     * Clear tooltip and all related timers
     * Public method to allow CytoscapeCore to clear tooltip when graph updates
     */
    public clearTooltip(): void {
        // Clear any pending tooltip timers
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }
        
        // Clear any pending hide timers
        if (this.hideTooltipTimer) {
            clearTimeout(this.hideTooltipTimer);
            this.hideTooltipTimer = null;
        }
        
        // Hide tooltip immediately
        this.hideTooltip();
    }
    
    /**
     * Handle click on nodes
     * When a node is clicked, it gets selected and all connected edges are highlighted
     * If the node is already selected, clicking it again will deselect it
     */
    private handleNodeClick(evt: any): void {
        const node = evt.target;
        if (!node) return; // Guard against null/undefined
        
        // Check if the node is already selected
        const isAlreadySelected = node.hasClass('selected');
        
        if (isAlreadySelected) {
            // Toggle: deselect the node
            this.clearSelection();
            return; // Don't focus or open file when deselecting
        }
        
        // Handle node selection: clear previous selection and select this node + its edges
        this.selectNode(node);
        
        // Optionally focus on the node when clicked
        if (this.focusOnClick && this.cameraManager) {
            const nodeId = node.data('id');
            if (nodeId) {
                this.cameraManager.focusOnNode(nodeId, {
                    padding: CONFIG.DEFAULT_PADDING,
                    animate: true,
                    ensureVisible: false // Don't re-ensure visibility, we already handled selection
                });
            }
        }
        
        const path = node.data('path');
        
        if (path) {
            this.vscode.postMessage({
                type: 'openFile',
                path: path
            });
        }
    }
    
    /**
     * Select a node and all its connected edges
     * This is the main selection handler for node clicks
     */
    private selectNode(node: any): void {
        if (!this.styleManager) {
            // Fallback to direct class manipulation if StyleManager not available
            const cy = this.stateManager.getCy();
            if (!cy) return;
            
            // Clear previous selection
            cy.nodes().removeClass('selected');
            cy.edges().removeClass('selected');
            
            // Select clicked node
            node.addClass('selected');
            
            // Select connected edges
            const connectedEdges = node.connectedEdges();
            connectedEdges.addClass('selected');
            
            // Remove inline styles from selected edges
            connectedEdges.forEach((edge: any) => {
                edge.removeStyle('line-color');
                edge.removeStyle('target-arrow-color');
                edge.removeStyle('source-arrow-color');
                edge.removeStyle('width');
            });
            
            // Force style recalculation
            if (cy.style) {
                cy.style().update();
            }
            return;
        }
        
        // Use StyleManager for centralized selection management
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Clear previous selection (removes selected class from all nodes and edges)
        this.styleManager.clearLayer(StyleLayer.INTERACTION);
        
        // Select the clicked node
        this.styleManager.applyInteraction(node, 'selected');
        
        // Get all connected edges and select them
        const connectedEdges = node.connectedEdges();
        if (connectedEdges.length > 0) {
            this.styleManager.applyEdgeInteraction(connectedEdges, 'selected');
            
            // Remove inline color styles from selected edges to ensure CSS takes precedence
            // Inline styles override CSS classes in Cytoscape, so we must remove them
            connectedEdges.forEach((edge: any) => {
                edge.removeStyle('line-color');
                edge.removeStyle('target-arrow-color');
                edge.removeStyle('source-arrow-color');
                edge.removeStyle('width'); // Also remove width to let CSS handle it
            });
            
            // Force Cytoscape to recalculate all styles after removing inline styles
            // This ensures CSS selectors are re-evaluated with the new class
            if (cy.style) {
                cy.style().update();
            }
        }
    }
    
    /**
     * Handle clicks on background (empty space) to clear selection
     */
    private handleBackgroundClick(evt: any): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const target = evt.target;
        
        // Only clear selection if clicking on the core (background), not on nodes or edges
        // In Cytoscape, when clicking on background, target === cy (the core)
        // When clicking on a node or edge, target is the node/edge element
        if (target === cy) {
            this.clearSelection();
        }
    }
    
    /**
     * Clear selection (remove selected class from all nodes and edges)
     */
    private clearSelection(): void {
        if (!this.styleManager) {
            // Fallback to direct class removal if StyleManager not available
            const cy = this.stateManager.getCy();
            if (!cy) return;
            cy.nodes().removeClass('selected');
            cy.edges().removeClass('selected');
            return;
        }
        
        // Use StyleManager to clear interaction layer (removes selected class from all nodes and edges)
        this.styleManager.clearLayer(StyleLayer.INTERACTION);
    }
    
    /**
     * Handle mouse over node
     * Only applies visual feedback (border-width), no tooltip on hover
     */
    private handleNodeMouseOver(evt: any): void {
        const node = evt.target;
        if (!node) return; // Guard against null/undefined
        
        // Skip hidden nodes (opacity-based hiding)
        const opacity = node.style('opacity');
        if (opacity < 0.5) {
            return; // Node is hidden, don't show hover effects
        }
        
        // Apply visual feedback immediately (border-width change only)
        node.style('border-width', CONFIG.COMPOUND_BORDER_WIDTH_HOVER);
    }
    
    /**
     * Display tooltip for a node at mouse position with viewport boundary detection
     */
    private displayTooltip(node: any): void {
        this.showNodeInfo(node);
        
        const tooltip = document.getElementById('nodeTooltip');
        if (!tooltip) return;
        
        // Get mouse position from tracked position or fallback to node position
        let mouseX: number;
        let mouseY: number;
        
        if (this.currentMousePosition) {
            mouseX = this.currentMousePosition.x;
            mouseY = this.currentMousePosition.y;
        } else {
            // Fallback to node position if mouse position not available
            const pos = node.renderedPosition();
            if (!pos) return;
            mouseX = pos.x;
            mouseY = pos.y;
        }
        
        // Position tooltip directly at mouse cursor (no offset)
        let left = mouseX;
        let top = mouseY;
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Get tooltip dimensions (approximate if not yet rendered)
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 280; // fallback to max-width
        const tooltipHeight = tooltipRect.height || 200; // approximate fallback
        
        // Adjust position if tooltip would go off-screen
        if (left + tooltipWidth > viewportWidth) {
            // Position to the left of the cursor instead
            left = mouseX - tooltipWidth;
        }
        if (left < 0) {
            left = 10; // Minimum margin from left edge
        }
        
        if (top + tooltipHeight > viewportHeight) {
            // Position above the cursor instead
            top = mouseY - tooltipHeight;
        }
        if (top < 0) {
            top = 10; // Minimum margin from top edge
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.visibility = 'visible';
    }
    
    /**
     * Handle mouse out from node
     */
    private handleNodeMouseOut(evt: any): void {
        const node = evt.target;
        if (!node) return; // Guard against null/undefined
        
        // Reset border-width to normal (only visual feedback, tooltip is not affected)
        node.style('border-width', BORDERS.normal);
    }
    
    /**
     * Handle right-click on node to show tooltip
     */
    private handleNodeRightClick(evt: any): void {
        const node = evt.target;
        if (!node) return; // Guard against null/undefined
        
        // Skip hidden nodes (opacity-based hiding)
        const opacity = node.style('opacity');
        if (opacity < 0.5) {
            return; // Node is hidden, don't show tooltip
        }
        
        // Prevent default context menu
        evt.preventDefault?.();
        evt.originalEvent?.preventDefault?.();
        
        // Capture mouse position from event
        if (evt && evt.renderedPosition) {
            this.currentMousePosition = {
                x: evt.renderedPosition.x,
                y: evt.renderedPosition.y
            };
        }
        
        // Clear any existing timers
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }
        if (this.hideTooltipTimer) {
            clearTimeout(this.hideTooltipTimer);
            this.hideTooltipTimer = null;
        }
        
        
        // Show tooltip immediately (no delay for click-based interaction)
        this.displayTooltip(node);
    }
    
    /**
     * Handle mouse over edge
     * Only applies visual feedback (width, opacity), no tooltip on hover
     */
    private handleEdgeMouseOver(evt: any): void {
        const edge = evt.target;
        if (!edge) return; // Guard against null/undefined
        
        // Skip hidden edges (opacity-based hiding)
        const edgeOpacity = edge.style('opacity');
        if (edgeOpacity < 0.5) {
            return; // Edge is hidden, don't show hover effects
        }
        
        // Don't override selected edge styling
        const isSelected = edge.hasClass('selected');
        if (isSelected) {
            return; // Let CSS selector handle selected edge styling
        }
        
        const source = edge.source();
        const target = edge.target();
        
        // Also check if connected nodes are visible
        const sourceOpacity = source.style('opacity');
        const targetOpacity = target.style('opacity');
        
        if (sourceOpacity < 0.5 || targetOpacity < 0.5) {
            return; // Connected nodes are hidden
        }
        
        // Use StyleManager for hover state if available
        if (this.styleManager) {
            this.styleManager.applyEdgeInteraction(edge, 'hover');
        } else {
            // Fallback to inline styles if StyleManager not available
            const currentWidth = parseFloat(edge.style('width')) || BORDERS.normal;
            edge.style('width', currentWidth * 2);
            edge.style('opacity', OPACITY.solid);
            edge.style('z-index', Z_INDEX.selected);
        }
        
        source.style('border-width', BORDERS.extraThick);
        target.style('border-width', BORDERS.extraThick);
    }
    
    /**
     * Handle right-click on edge to show tooltip
     */
    private handleEdgeRightClick(evt: any): void {
        const edge = evt.target;
        if (!edge) return; // Guard against null/undefined
        
        // Skip hidden edges (opacity-based hiding)
        const edgeOpacity = edge.style('opacity');
        if (edgeOpacity < 0.5) {
            return; // Edge is hidden, don't show tooltip
        }
        
        // Prevent default context menu
        evt.preventDefault?.();
        evt.originalEvent?.preventDefault?.();
        
        // Capture mouse position from event
        if (evt && evt.renderedPosition) {
            this.currentMousePosition = {
                x: evt.renderedPosition.x,
                y: evt.renderedPosition.y
            };
        }
        
        // Clear any existing timers
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }
        if (this.hideTooltipTimer) {
            clearTimeout(this.hideTooltipTimer);
            this.hideTooltipTimer = null;
        }
        
        // Show tooltip immediately (no delay for click-based interaction)
        this.showEdgeTooltip(edge, evt);
    }
    
    /**
     * Handle mouse out from edge
     * Uses StyleManager to clear hover state (only visual feedback, tooltip not affected)
     */
    private handleEdgeMouseOut(evt: any): void {
        const edge = evt.target;
        if (!edge) return; // Guard against null/undefined
        
        // Don't override selected edge styling
        const isSelected = edge.hasClass('selected');
        if (isSelected) {
            // Selected edges - only reset hover effects, preserve selection styling
            if (this.styleManager) {
                this.styleManager.clearEdgeInteraction(edge, 'hover');
            }
            return; // Let CSS selector handle selected edge styling
        }
        
        const source = edge.source();
        const target = edge.target();
        
        // Use StyleManager to clear hover state if available
        if (this.styleManager) {
            this.styleManager.clearEdgeInteraction(edge, 'hover');
        } else {
            // Fallback to inline styles if StyleManager not available
            const edgeType = edge.data('edgeType');
            let defaultWidth: number = BORDERS.normal;
            if (edgeType === 'depends-on') defaultWidth = BORDERS.medium;
            else if (edgeType === 'imports') defaultWidth = BORDERS.medium;
            else if (edgeType === 'extends' || edgeType === 'implements') defaultWidth = BORDERS.normal;
            else if (edgeType === 'calls') defaultWidth = BORDERS.thin;
            
            edge.style('width', defaultWidth);
            edge.style('opacity', edge.data('isGhosted') ? OPACITY.subtle : OPACITY.medium);
            edge.style('z-index', Z_INDEX.edge);
        }
        
        source.style('border-width', BORDERS.normal);
        target.style('border-width', BORDERS.normal);
    }
    
    /**
     * Show node information tooltip
     */
    private showNodeInfo(node: any): void {
        const tooltip = document.getElementById('nodeTooltip');
        if (!tooltip) return;
        
        const data = node.data();
        const loc = data.linesOfCode || 0;
        const complexity = data.complexity || 0;
        const dependents = data.dependents || 0;
        const daysSinceChange = data.daysSinceLastChange ?? 'N/A';
        const layer = data.layer || 'unknown';
        
        tooltip.innerHTML = `
            <div class="tooltip-header">${data.label}</div>
            <div class="tooltip-content">
                <div><strong>Type:</strong> ${data.type || 'file'}</div>
                ${data.roleDescription ? `<div><strong>Description:</strong> ${data.roleDescription}</div>` : ''}
                ${data.path ? `<div><strong>Path:</strong> ${data.path}</div>` : ''}
                ${loc > 0 ? `<div><strong>Lines:</strong> ${loc}</div>` : ''}
                ${complexity > 0 ? `<div><strong>Complexity:</strong> ${complexity}</div>` : ''}
                ${dependents > 0 ? `<div><strong>Dependents:</strong> ${dependents}</div>` : ''}
                ${daysSinceChange !== 'N/A' ? `<div><strong>Last Changed:</strong> ${daysSinceChange} days ago</div>` : ''}
                <div><strong>Layer:</strong> ${layer}</div>
                ${data.isEntryPoint ? '<div class="entry-point-badge">Entry Point</div>' : ''}
            </div>
        `;
        tooltip.style.display = 'block';
    }
    
    /**
     * Show edge tooltip with viewport boundary detection
     */
    private showEdgeTooltip(edge: any, evt: any): void {
        const tooltip = document.getElementById('nodeTooltip');
        if (!tooltip) return;
        
        // Guard against missing event data
        if (!evt || !evt.renderedPosition) return;
        
        const source = edge.source();
        const target = edge.target();
        const edgeType = edge.data('edgeType') || 'connection';
        
        let typeBadge = '';
        let badgeColor = '#666';
        
        switch (edgeType) {
            // Code/Component layer edges
            case 'imports':
                typeBadge = '📦 Import';
                badgeColor = COLORS.edges.imports;
                break;
            case 'depends-on':
                typeBadge = '🔗 Dependency';
                badgeColor = COLORS.edges.dependsOn;
                break;
            case 'calls':
                typeBadge = '📞 Call';
                badgeColor = COLORS.edges.calls;
                break;
            case 'extends':
                typeBadge = '⬆️ Extends';
                badgeColor = COLORS.edges.extends;
                break;
            case 'implements':
                typeBadge = '📋 Implements';
                badgeColor = COLORS.edges.implements;
                break;
            case 'uses':
                typeBadge = '👤 Uses';
                badgeColor = COLORS.edges.uses;
                break;
            
            // Workflow layer edges
            case 'depends-on-feature':
                typeBadge = '🔗 Feature Dependency';
                badgeColor = COLORS.edges.dependsOnFeature;
                break;
            case 'part-of':
                typeBadge = '📦 Part Of';
                badgeColor = COLORS.edges.partOf;
                break;
            case 'primary-flow':
                typeBadge = '➡️ Primary Flow';
                badgeColor = COLORS.edges.primaryFlow;
                break;
            case 'alternate-flow':
                typeBadge = '⤴️ Alternate Flow';
                badgeColor = COLORS.edges.alternateFlow;
                break;
            case 'triggers':
                typeBadge = '⚡ Triggers';
                badgeColor = COLORS.edges.triggers;
                break;
            
            // Context layer edges (boundary interactions)
            case 'integrates-with':
                typeBadge = '🔄 Integrates With';
                badgeColor = COLORS.edges.integratesWith;
                break;
            case 'authenticates-with':
                typeBadge = '🔐 Authenticates With';
                badgeColor = COLORS.edges.authenticatesWith;
                break;
            case 'reads-from':
                typeBadge = '📖 Reads From';
                badgeColor = COLORS.edges.readsFrom;
                break;
            case 'writes-to':
                typeBadge = '✍️ Writes To';
                badgeColor = COLORS.edges.writesTo;
                break;
            case 'sends-event-to':
                typeBadge = '📤 Sends Event To';
                badgeColor = COLORS.edges.sendsEventTo;
                break;
            case 'receives-event-from':
                typeBadge = '📥 Receives Event From';
                badgeColor = COLORS.edges.receivesEventFrom;
                break;
            
            // Container layer edges (runtime semantics)
            case 'http-request':
                typeBadge = '🌐 HTTP Request';
                badgeColor = COLORS.edges.httpRequest;
                break;
            case 'rpc-call':
                typeBadge = '⚡ RPC Call';
                badgeColor = COLORS.edges.rpcCall;
                break;
            case 'db-query':
                typeBadge = '🗄️ DB Query';
                badgeColor = COLORS.edges.dbQuery;
                break;
            case 'cache-read':
                typeBadge = '⚡ Cache Read';
                badgeColor = COLORS.edges.cacheRead;
                break;
            case 'cache-write':
                typeBadge = '💾 Cache Write';
                badgeColor = COLORS.edges.cacheWrite;
                break;
            case 'publish-event':
                typeBadge = '📢 Publish Event';
                badgeColor = COLORS.edges.publishEvent;
                break;
            case 'consume-event':
                typeBadge = '📨 Consume Event';
                badgeColor = COLORS.edges.consumeEvent;
                break;
            case 'enqueue-job':
                typeBadge = '📋 Enqueue Job';
                badgeColor = COLORS.edges.enqueueJob;
                break;
            case 'replicates-to':
                typeBadge = '🔁 Replicates To';
                badgeColor = COLORS.edges.replicatesTo;
                break;
            case 'syncs-with':
                typeBadge = '🔄 Syncs With';
                badgeColor = COLORS.edges.syncsWith;
                break;
            
            // Legacy edges
            case 'sends-data-to':
                typeBadge = '📤 Sends Data To';
                badgeColor = COLORS.edges.writesTo;
                break;
            case 'receives-data-from':
                typeBadge = '📥 Receives Data From';
                badgeColor = COLORS.edges.readsFrom;
                break;
            case 'publishes-to':
                typeBadge = '📢 Publishes To';
                badgeColor = COLORS.edges.publishEvent;
                break;
            case 'subscribes-to':
                typeBadge = '📨 Subscribes To';
                badgeColor = COLORS.edges.consumeEvent;
                break;
            
            default:
                typeBadge = `→ ${edgeType}`;
                badgeColor = COLORS.edges.default;
        }
        
        const isExternal = edge.data('isGhosted') || edge.style('line-style') === 'dashed';
        
        // Get edge description and node descriptions
        const edgeDescription = edge.data('description') || '';
        const sourceDescription = source.data('roleDescription') || '';
        const targetDescription = target.data('roleDescription') || '';
        
        tooltip.innerHTML = `
            <div class="tooltip-header" style="border-bottom-color: ${badgeColor}">
                <span style="background: ${badgeColor}; padding: var(--spacing-xxs) var(--spacing-sm); border-radius: var(--border-radius-sm); color: white; font-size: var(--font-size-xs); margin-right: var(--spacing-sm);">
                    ${typeBadge}
                </span>
                ${isExternal ? `<span style="color: ${COLORS.warning}; font-size: var(--font-size-xs);">External</span>` : ''}
            </div>
            <div class="tooltip-content">
                <div style="margin-bottom: var(--spacing-sm); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--border-radius-sm);">
                    <strong>Type:</strong> <code style="font-size: var(--font-size-xs); color: ${badgeColor};">${edgeType}</code>
                </div>
                ${edgeDescription ? `<div style="margin-bottom: var(--spacing-sm); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--border-radius-sm);"><strong>Description:</strong> ${edgeDescription}</div>` : ''}
                <div><strong>From:</strong> ${source.data('label')}</div>
                ${sourceDescription ? `<div style="margin-left: var(--spacing-md); margin-bottom: var(--spacing-sm); color: var(--color-text-secondary); font-size: var(--font-size-xs);">${sourceDescription}</div>` : ''}
                <div style="margin-top: var(--spacing-sm);"><strong>To:</strong> ${target.data('label')}</div>
                ${targetDescription ? `<div style="margin-left: var(--spacing-md); margin-bottom: var(--spacing-sm); color: var(--color-text-secondary); font-size: var(--font-size-xs);">${targetDescription}</div>` : ''}
                ${isExternal ? `<div style="color: ${COLORS.warning}; margin-top: var(--spacing-sm);">💡 Cross-hierarchy dependency</div>` : ''}
            </div>
        `;
        
        // Position tooltip directly at mouse cursor (no offset)
        let left = evt.renderedPosition.x;
        let top = evt.renderedPosition.y;
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Get tooltip dimensions (approximate if not yet rendered)
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 280; // fallback to max-width
        const tooltipHeight = tooltipRect.height || 200; // approximate fallback
        
        // Adjust position if tooltip would go off-screen
        if (left + tooltipWidth > viewportWidth) {
            // Position to the left of the cursor instead
            left = evt.renderedPosition.x - tooltipWidth;
        }
        if (left < 0) {
            left = 10; // Minimum margin from left edge
        }
        
        if (top + tooltipHeight > viewportHeight) {
            // Position above the cursor instead
            top = evt.renderedPosition.y - tooltipHeight;
        }
        if (top < 0) {
            top = 10; // Minimum margin from top edge
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.visibility = 'visible';
    }
    
    /**
     * Hide tooltip helper method
     */
    private hideTooltip(): void {
        const tooltip = document.getElementById('nodeTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.style.visibility = 'hidden';
        }
    }
}



