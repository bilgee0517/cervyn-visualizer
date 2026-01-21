/**
 * Feature Tracing Service
 * Manages the feature-to-code tracing panel for the workflow layer
 */

import { logMessage } from '../shared/utils';
import { StateManager } from '../shared/state-manager';

export class FeatureTracingService {
    private vscode: any;
    private stateManager: StateManager;
    private cy: any;
    private panel: HTMLElement | null = null;
    private closeBtn: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
        this.initPanel();
    }
    
    /**
     * Initialize the panel elements
     */
    private initPanel(): void {
        this.panel = document.getElementById('featureTracingPanel');
        this.closeBtn = document.getElementById('featureTracingClose');
        this.titleEl = document.getElementById('featureTracingTitle');
        this.contentEl = document.getElementById('featureTracingContent');
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.hidePanel();
            });
        }
        
        logMessage(this.vscode, '[FeatureTracingService] Panel initialized');
    }
    
    /**
     * Set Cytoscape instance
     */
    setCy(cy: any): void {
        this.cy = cy;
        
        // Hook into node click events
        if (cy) {
            cy.on('tap', 'node', (evt: any) => {
                const node = evt.target;
                this.handleNodeClick(node);
            });
        }
    }
    
    /**
     * Handle node click event
     * Only shows panel for code layer nodes (left-click)
     */
    private handleNodeClick(node: any): void {
        const nodeType = node.data('type');
        const currentLayer = this.stateManager.getCurrentLayer();
        
        // Only show panel for code layer nodes
        if (currentLayer === 'code' && node.data('supportsFeatures')) {
            this.showSupportedFeatures(node);
        }
        else {
            // Hide panel for all other layers (workflow, context, container, component)
            this.hidePanel();
        }
    }
    
    /**
     * Show feature details (for workflow layer)
     */
    private showFeatureDetails(node: any): void {
        const label = node.data('label') || node.id();
        const type = node.data('type');
        const supportedBy = node.data('supportedBy') || [];
        const description = node.data('roleDescription') || '';
        
        if (this.titleEl) {
            this.titleEl.textContent = `Feature: ${label}`;
        }
        
        if (this.contentEl) {
            let html = '<div class="feature-info">';
            
            if (description) {
                html += `
                    <div class="feature-info-label">Description</div>
                    <div class="feature-info-value">${this.escapeHtml(description)}</div>
                `;
            }
            
            html += `
                <div class="feature-info-label">Type</div>
                <div class="feature-info-value">${this.escapeHtml(type)}</div>
            `;
            
            html += '</div>';
            
            // Implementation section
            html += '<div class="feature-info-label">Implementation</div>';
            
            if (supportedBy && supportedBy.length > 0) {
                html += '<ul class="implementation-list">';
                
                supportedBy.forEach((nodeId: string) => {
                    const implNode = this.cy ? this.cy.getElementById(nodeId) : null;
                    if (implNode && implNode.length > 0) {
                        const implLabel = implNode.data('label') || nodeId;
                        const implType = implNode.data('type') || 'unknown';
                        const icon = this.getTypeIcon(implType);
                        
                        html += `
                            <li class="implementation-item" data-node-id="${this.escapeHtml(nodeId)}">
                                <span class="implementation-item-icon">${icon}</span>
                                <span class="implementation-item-label">${this.escapeHtml(implLabel)}</span>
                                <span class="implementation-item-type">${this.escapeHtml(implType)}</span>
                            </li>
                        `;
                    }
                });
                
                html += '</ul>';
                
                html += `
                    <button class="jump-to-layer-btn" id="jumpToCodeLayerBtn">
                        Jump to Code Layer
                    </button>
                `;
            } else {
                html += `
                    <div class="no-implementation">
                        No implementation found. This feature may not be implemented yet.
                    </div>
                `;
            }
            
            this.contentEl.innerHTML = html;
            
            // Add click handlers for implementation items
            const implItems = this.contentEl.querySelectorAll('.implementation-item');
            implItems.forEach((item) => {
                item.addEventListener('click', () => {
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId && this.cy) {
                        this.highlightNode(nodeId);
                    }
                });
            });
            
            // Add click handler for jump button
            const jumpBtn = document.getElementById('jumpToCodeLayerBtn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    this.jumpToCodeLayer();
                });
            }
        }
        
        this.showPanel();
    }
    
    /**
     * Show supported features (for non-workflow layers)
     */
    private showSupportedFeatures(node: any): void {
        const label = node.data('label') || node.id();
        const type = node.data('type');
        const supportsFeatures = node.data('supportsFeatures') || [];
        
        if (this.titleEl) {
            this.titleEl.textContent = `Supports Features`;
        }
        
        if (this.contentEl) {
            let html = '<div class="feature-info">';
            
            html += `
                <div class="feature-info-label">Node</div>
                <div class="feature-info-value">${this.escapeHtml(label)}</div>
                <div class="feature-info-label">Type</div>
                <div class="feature-info-value">${this.escapeHtml(type)}</div>
            `;
            
            html += '</div>';
            
            // Features section
            html += '<div class="feature-info-label">Features Supported</div>';
            
            if (supportsFeatures && supportsFeatures.length > 0) {
                html += '<ul class="implementation-list">';
                
                supportsFeatures.forEach((featureId: string) => {
                    const featureNode = this.cy ? this.cy.getElementById(featureId) : null;
                    if (featureNode && featureNode.length > 0) {
                        const featureLabel = featureNode.data('label') || featureId;
                        
                        html += `
                            <li class="implementation-item" data-node-id="${this.escapeHtml(featureId)}">
                                <span class="implementation-item-icon">⚡</span>
                                <span class="implementation-item-label">${this.escapeHtml(featureLabel)}</span>
                            </li>
                        `;
                    }
                });
                
                html += '</ul>';
                
                html += `
                    <button class="jump-to-layer-btn" id="jumpToWorkflowLayerBtn">
                        Jump to Workflow Layer
                    </button>
                `;
            } else {
                html += `
                    <div class="no-implementation">
                        This node doesn't explicitly support any features.
                    </div>
                `;
            }
            
            this.contentEl.innerHTML = html;
            
            // Add click handlers for feature items
            const featureItems = this.contentEl.querySelectorAll('.implementation-item');
            featureItems.forEach((item) => {
                item.addEventListener('click', () => {
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        this.jumpToWorkflowLayer(nodeId);
                    }
                });
            });
            
            // Add click handler for jump button
            const jumpBtn = document.getElementById('jumpToWorkflowLayerBtn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    this.jumpToWorkflowLayer();
                });
            }
        }
        
        this.showPanel();
    }
    
    /**
     * Show the panel
     */
    private showPanel(): void {
        if (this.panel) {
            this.panel.style.display = 'flex';
        }
    }
    
    /**
     * Hide the panel
     */
    private hidePanel(): void {
        if (this.panel) {
            this.panel.style.display = 'none';
        }
    }
    
    /**
     * Highlight a node in the graph
     */
    private highlightNode(nodeId: string): void {
        if (!this.cy) return;
        
        const node = this.cy.getElementById(nodeId);
        if (node && node.length > 0) {
            // Center on node
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5
            }, {
                duration: 500
            });
            
            // Flash the node
            node.addClass('highlighted');
            setTimeout(() => {
                node.removeClass('highlighted');
            }, 2000);
        }
    }
    
    /**
     * Jump to code layer and highlight implementation
     */
    private jumpToCodeLayer(): void {
        logMessage(this.vscode, '[FeatureTracingService] Jumping to code layer');
        this.vscode.postMessage({
            type: 'changeLayer',
            layer: 'code'
        });
        this.hidePanel();
    }
    
    /**
     * Jump to workflow layer and optionally highlight a feature
     */
    private jumpToWorkflowLayer(featureId?: string): void {
        logMessage(this.vscode, `[FeatureTracingService] Jumping to workflow layer${featureId ? ' (feature: ' + featureId + ')' : ''}`);
        this.vscode.postMessage({
            type: 'changeLayer',
            layer: 'workflow'
        });
        
        if (featureId) {
            // Wait a bit for layer to load, then highlight
            setTimeout(() => {
                this.highlightNode(featureId);
            }, 500);
        }
        
        this.hidePanel();
    }
    
    /**
     * Get icon for node type
     */
    private getTypeIcon(type: string): string {
        const icons: Record<string, string> = {
            'file': '📄',
            'directory': '📁',
            'class': '🔷',
            'function': '⚡',
            'service': '⚙️',
            'application': '🖥️',
            'module': '📦',
            'component': '🧩',
            'container': '📦',
            'microservice': '🔹',
        };
        return icons[type] || '•';
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
