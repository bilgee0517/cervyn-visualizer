/**
 * UI Controller for Cytoscape webview
 * Manages toolbar buttons, controls, and UI state
 */

import { logMessage, updateZoomDisplay } from '../shared/utils';
import { StateManager } from '../shared/state-manager';
import { COLORS, generateColorVariations } from '../../config/colors';
import { StyleManager, StyleLayer } from './style-manager';

export class UIController {
    private vscode: any;
    private stateManager: StateManager;
    private onLayoutChange: ((layout: string) => void) | null = null;
    private onDepthChange: ((depth: number) => void) | null = null;
    private onExpandContext: (() => void) | null = null;
    private onResetContext: (() => void) | null = null;
    private cameraManager: any = null; // Will be set after CameraManager is initialized
    private styleManager?: StyleManager; // Will be set after StyleManager is initialized
    private dropdownOpen: boolean = false;
    private minimapCanvas: HTMLCanvasElement | null = null;
    private minimapCtx: CanvasRenderingContext2D | null = null;
    private searchResults: any[] = [];
    private selectedResultIndex: number = -1;
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const moreBtn = document.getElementById('moreOptionsBtn');
            const dropdown = document.getElementById('moreOptionsMenu');
            if (moreBtn && dropdown && !moreBtn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });
    }
    
    /**
     * Set layout change callback
     */
    onLayoutChangeCallback(callback: (layout: string) => void): void {
        this.onLayoutChange = callback;
    }
    
    /**
     * Set depth change callback
     */
    onDepthChangeCallback(callback: (depth: number) => void): void {
        this.onDepthChange = callback;
    }
    
    /**
     * Set expand context callback
     */
    onExpandContextCallback(callback: () => void): void {
        this.onExpandContext = callback;
    }
    
    /**
     * Set reset context callback
     */
    onResetContextCallback(callback: () => void): void {
        this.onResetContext = callback;
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
     * Initialize all UI controls
     */
    initializeControls(): void {
        this.initZoomControls();
        // Layout is fixed to fCoSE - no selector needed
        this.initContextControls();
        this.initNodeSearch();
        this.initLayerSelector();
        this.initOnboardingControls();
        this.initDropdownMenu();
        this.initHelpButton();
        this.initColorPickers();
        this.initRefreshButton();
        this.initMinimap();
    }
    
    /**
     * Initialize zoom controls
     */
    private initZoomControls(): void {
        const cy = this.stateManager.getCy();
        
        // Listen to zoom changes for display update
        if (cy) {
            cy.on('zoom', () => updateZoomDisplay(cy));
        }
    }
    
    /**
     * Layout is fixed to fCoSE - no selector needed
     * initLayoutSelector removed as part of simplification
     */
    
    /**
     * Initialize dropdown menu
     */
    private initDropdownMenu(): void {
        const moreOptionsBtn = document.getElementById('moreOptionsBtn');
        if (moreOptionsBtn) {
            moreOptionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
    }
    
    /**
     * Initialize help button
     */
    private initHelpButton(): void {
        const showHelpBtn = document.getElementById('showHelpBtn');
        if (showHelpBtn) {
            showHelpBtn.addEventListener('click', () => {
                this.closeDropdown();
                this.showOnboarding();
            });
        }
    }
    
    /**
     * Initialize refresh graph button
     */
    private initRefreshButton(): void {
        // Try multiple times in case DOM isn't ready yet
        const tryInit = (attempt: number = 0) => {
            const refreshGraphBtn = document.getElementById('refreshGraphBtn');
            if (refreshGraphBtn) {
                logMessage(this.vscode, `[UI] Refresh graph button found (attempt ${attempt + 1}), attaching handler`);
                refreshGraphBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logMessage(this.vscode, '[UI] Refresh graph button clicked');
                    this.closeDropdown();
                    
                    // Send message to extension - let VS Code show the confirmation dialog
                    // This is more reliable than browser confirm() which can be blocked
                    logMessage(this.vscode, '[UI] Sending refreshGraph request to extension');
                    try {
                        this.vscode.postMessage({
                            type: 'refreshGraph'
                        });
                        logMessage(this.vscode, '[UI] Refresh graph message sent successfully');
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logMessage(this.vscode, `[UI] Error sending refresh message: ${errorMsg}`);
                        console.error('Error sending refresh message:', error);
                        alert(`Error: ${errorMsg}`);
                    }
                });
            } else if (attempt < 5) {
                // Retry after a short delay if button not found
                setTimeout(() => tryInit(attempt + 1), 100);
            } else {
                logMessage(this.vscode, '[UI] WARNING: Refresh graph button not found after 5 attempts');
                console.error('Refresh graph button not found in DOM');
            }
        };
        
        tryInit();
    }
    
    /**
     * Initialize color pickers for theme customization
     */
    private initColorPickers(): void {
        const nodeColorPicker = document.getElementById('nodeColorPicker') as HTMLInputElement;
        const edgeColorPicker = document.getElementById('edgeColorPicker') as HTMLInputElement;
        const resetColorsBtn = document.getElementById('resetColorsBtn');
        
        if (nodeColorPicker) {
            nodeColorPicker.addEventListener('change', (e) => {
                const color = (e.target as HTMLInputElement).value;
                this.updateNodeColors(color);
                logMessage(this.vscode, `Node color changed to: ${color}`);
            });
        }
        
        if (edgeColorPicker) {
            edgeColorPicker.addEventListener('change', (e) => {
                const color = (e.target as HTMLInputElement).value;
                this.updateEdgeColors(color);
                logMessage(this.vscode, `Edge color changed to: ${color}`);
            });
        }
        
        if (resetColorsBtn) {
            resetColorsBtn.addEventListener('click', () => {
                this.resetColors();
                if (nodeColorPicker) nodeColorPicker.value = COLORS.primary;
                if (edgeColorPicker) edgeColorPicker.value = COLORS.edges.default;
                logMessage(this.vscode, 'Colors reset to default');
            });
        }
    }
    
    /**
     * Update node colors based on user selection
     */
    private updateNodeColors(baseColor: string): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Generate color variations from base color
        const variations = this.generateColorVariations(baseColor);
        
        // Update all nodes
        cy.nodes().forEach((node: any) => {
            const type = node.data('type');
            if (type === 'directory') {
                node.style('background-color', variations.lightest);
                node.style('border-color', variations.light);
            } else if (type === 'file') {
                node.style('background-color', variations.veryLight);
                node.style('border-color', variations.light);
            } else if (type === 'class') {
                node.style('background-color', variations.light);
                node.style('border-color', variations.medium);
            } else if (type === 'function') {
                node.style('background-color', variations.light);
                node.style('border-color', baseColor);
            } else {
                node.style('background-color', baseColor);
                node.style('border-color', variations.dark);
            }
        });
    }
    
    /**
     * Update edge colors based on user selection
     * Uses StyleManager for centralized style management
     * NOTE: This is a placeholder - user color customization for edges would require
     * CSS custom properties or a different approach since edges don't support inline color styles
     * For now, we skip selected edges to preserve their styling
     */
    private updateEdgeColors(baseColor: string): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // If StyleManager is available, we should use it, but edge color customization
        // via user layer would require CSS custom properties support
        // For now, we preserve selected edges and only update non-selected edges
        cy.edges().forEach((edge: any) => {
            // Skip selected edges - they should maintain their orange color
            if (edge.hasClass('selected')) {
                return;
            }
            
            // Apply inline style only for non-selected edges
            // TODO: This should be refactored to use StyleManager with CSS custom properties
            edge.style('line-color', baseColor);
            edge.style('target-arrow-color', baseColor);
        });
    }
    
    /**
     * Reset colors to default theme
     * Uses StyleManager to clear user layer and remove inline styles
     */
    private resetColors(): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Clear user layer if StyleManager is available
        if (this.styleManager) {
            this.styleManager.clearLayer(StyleLayer.USER);
        }
        
        // Force re-apply default styles by removing inline styles
        cy.nodes().forEach((node: any) => {
            node.removeStyle('background-color');
            node.removeStyle('border-color');
        });
        
        // Remove inline styles from edges, but preserve selected edges
        cy.edges().forEach((edge: any) => {
            // Only remove inline styles if edge is not selected
            // Selected edges should maintain their CSS-defined styling
            if (!edge.hasClass('selected')) {
                edge.removeStyle('line-color');
                edge.removeStyle('target-arrow-color');
            }
        });
    }
    
    /**
     * Generate color variations from a base color
     * Uses centralized color utility
     */
    private generateColorVariations(hexColor: string): any {
        return generateColorVariations(hexColor);
    }
    
    /**
     * Toggle dropdown menu
     */
    private toggleDropdown(): void {
        const dropdown = document.getElementById('moreOptionsMenu');
        if (!dropdown) return;
        
        if (this.dropdownOpen) {
            this.closeDropdown();
        } else {
            dropdown.classList.add('active');
            this.dropdownOpen = true;
        }
    }
    
    /**
     * Close dropdown menu
     */
    private closeDropdown(): void {
        const dropdown = document.getElementById('moreOptionsMenu');
        if (!dropdown) return;
        
        dropdown.classList.remove('active');
        this.dropdownOpen = false;
    }
    
    /**
     * Initialize context controls (deprecated - replaced by search)
     */
    private initContextControls(): void {
        // Context controls removed - replaced by node search
    }
    
    /**
     * Initialize node search functionality
     */
    private initNodeSearch(): void {
        const searchInput = document.getElementById('nodeSearchInput') as HTMLInputElement;
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;
        
        // Handle input changes
        let searchTimeout: any = null;
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.trim();
            
            // Clear previous timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Show/hide clear button
            if (clearSearchBtn) {
                clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
            }
            
            if (query.length === 0) {
                this.hideSearchResults();
                return;
            }
            
            // Debounce search
            searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        });
        
        // Handle Enter key to focus on first result
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.searchResults.length > 0) {
                    const firstResult = this.searchResults[0];
                    this.focusOnNode(firstResult.nodeId);
                    this.hideSearchResults();
                    searchInput.value = '';
                    if (clearSearchBtn) clearSearchBtn.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                this.hideSearchResults();
                searchInput.blur();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedResultIndex = Math.min(this.selectedResultIndex + 1, this.searchResults.length - 1);
                this.updateSearchResultsDisplay();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedResultIndex = Math.max(this.selectedResultIndex - 1, -1);
                this.updateSearchResultsDisplay();
            }
        });
        
        // Clear search button
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                this.hideSearchResults();
                searchInput.focus();
            });
        }
        
        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            const target = e.target as Node;
            if (!searchInput.contains(target) && !searchResults.contains(target) && 
                (!clearSearchBtn || !clearSearchBtn.contains(target))) {
                this.hideSearchResults();
            }
        });
    }
    
    /**
     * Perform search and display results
     */
    private performSearch(query: string): void {
        if (!this.cameraManager) {
            logMessage(this.vscode, '[UIController] CameraManager not available for search');
            return;
        }
        
        const results = this.cameraManager.searchNodes(query, 10);
        this.searchResults = results;
        this.selectedResultIndex = -1;
        
        if (results.length === 0) {
            this.showSearchResults([{ 
                nodeId: '', 
                label: 'No results found', 
                type: '', 
                matchScore: 0 
            }], true);
        } else {
            this.showSearchResults(results);
        }
    }
    
    /**
     * Show search results dropdown
     */
    private showSearchResults(results: any[], isEmpty: boolean = false): void {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('nodeSearchInput') as HTMLInputElement;
        if (!searchResults) return;
        
        const query = searchInput ? searchInput.value.trim() : '';
        
        if (isEmpty) {
            searchResults.innerHTML = '<div class="search-result-item empty">No results found</div>';
        } else {
            searchResults.innerHTML = results.map((result, index) => {
                const isSelected = index === this.selectedResultIndex;
                return `
                    <div class="search-result-item ${isSelected ? 'selected' : ''}" 
                         data-node-id="${result.nodeId}" 
                         data-index="${index}">
                        <div class="search-result-content">
                            <div class="search-result-label">${this.highlightMatch(result.label, query)}</div>
                            ${result.path ? `<div class="search-result-path">${result.path}</div>` : ''}
                            <div class="search-result-type">${result.type}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Add click handlers
            searchResults.querySelectorAll('.search-result-item').forEach((item) => {
                const nodeId = (item as HTMLElement).dataset.nodeId;
                if (nodeId) {
                    item.addEventListener('click', () => {
                        this.focusOnNode(nodeId);
                        this.hideSearchResults();
                        const searchInput = document.getElementById('nodeSearchInput') as HTMLInputElement;
                        if (searchInput) {
                            searchInput.value = '';
                            const clearSearchBtn = document.getElementById('clearSearchBtn');
                            if (clearSearchBtn) clearSearchBtn.style.display = 'none';
                        }
                    });
                }
            });
        }
        
        searchResults.style.display = 'block';
    }
    
    /**
     * Update search results display (for keyboard navigation)
     */
    private updateSearchResultsDisplay(): void {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            if (index === this.selectedResultIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    /**
     * Hide search results dropdown
     */
    private hideSearchResults(): void {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.style.display = 'none';
        }
        this.selectedResultIndex = -1;
    }
    
    /**
     * Focus on a node
     */
    private focusOnNode(nodeId: string): void {
        if (!this.cameraManager) return;
        
        logMessage(this.vscode, `[UIController] Focusing on node: ${nodeId}`);
        this.cameraManager.focusOnNode(nodeId, {
            padding: 50,
            animate: true,
            duration: 500
        });
    }
    
    /**
     * Highlight matching text in search results
     */
    private highlightMatch(text: string, query: string): string {
        if (!query) return text;
        
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    /**
     * Initialize onboarding controls
     */
    private initOnboardingControls(): void {
        const onboardingGotIt = document.getElementById('onboardingGotIt');
        if (onboardingGotIt) {
            onboardingGotIt.addEventListener('click', () => {
                this.hideOnboarding();
            });
        }
        
        const onboardingTour = document.getElementById('onboardingTour');
        if (onboardingTour) {
            onboardingTour.addEventListener('click', () => {
                this.showFullTour();
            });
        }
        
        const onboardingClose = document.getElementById('onboardingClose');
        if (onboardingClose) {
            onboardingClose.addEventListener('click', () => {
                this.hideOnboarding();
            });
        }
    }
    
    
    /**
     * Show onboarding overlay
     */
    showOnboarding(): void {
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;
        
        // TODO: Implement focus context if needed
        // const focusContext = this.stateManager.getFocusContext();
        const focusLabel = document.getElementById('focusFileLabel');
        
        if (focusLabel) {
            focusLabel.textContent = 'Viewing: Entry points and important nodes';
        }
        
        overlay.style.display = 'flex';
        logMessage(this.vscode, 'Showing onboarding overlay');
    }
    
    /**
     * Hide onboarding overlay
     */
    hideOnboarding(): void {
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;
        
        overlay.style.display = 'none';
        this.stateManager.setHasSeenOnboarding(true);
        logMessage(this.vscode, 'Onboarding dismissed');
    }
    
    /**
     * Show full tour
     */
    private showFullTour(): void {
        this.hideOnboarding();
        this.vscode.postMessage({
            type: 'alert',
            message: 'Full tour feature coming soon! For now, explore the controls in the toolbar.'
        });
    }
    
    /**
     * Layout is fixed to fCoSE - updateLayoutSelector removed
     */
    
    /**
     * Initialize minimap
     */
    private initMinimap(): void {
        const canvas = document.getElementById('minimapCanvas') as HTMLCanvasElement;
        if (!canvas) return;
        
        this.minimapCanvas = canvas;
        this.minimapCtx = canvas.getContext('2d');
        
        // Set canvas size
        const container = canvas.parentElement;
        if (container) {
            canvas.width = container.clientWidth * 2; // 2x for better quality
            canvas.height = container.clientHeight * 2;
        }
        
        // Ensure canvas is clickable and above everything
        canvas.style.pointerEvents = 'auto';
        canvas.style.cursor = 'crosshair';
        canvas.style.position = 'relative';
        canvas.style.zIndex = '1001';
        
        // Ensure container is also clickable
        if (container) {
            container.style.pointerEvents = 'auto';
            container.style.zIndex = '1001';
        }
        
        // Click to navigate - use both mousedown and click for better compatibility
        const handleClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('[Minimap] Click detected at:', e.clientX, e.clientY);
            this.handleMinimapClick(e);
        };
        
        // Use capture phase to ensure we get the event first
        canvas.addEventListener('click', handleClick, true);
        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);
        
        // Also add to parent container as fallback
        if (container) {
            container.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log('[Minimap] Container click detected');
                handleClick(e);
            }, true);
        }
        
        // Update minimap on graph changes
        const cy = this.stateManager.getCy();
        if (cy) {
            cy.on('render', () => {
                this.updateMinimap();
            });
            
            // Initial render
            this.updateMinimap();
        }
    }
    
    /**
     * Update minimap display
     */
    private updateMinimap(): void {
        if (!this.minimapCanvas || !this.minimapCtx) return;
        
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const ctx = this.minimapCtx;
        const canvas = this.minimapCanvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Get graph bounds
        const extent = cy.elements().boundingBox();
        if (!extent.w || !extent.h) return;
        
        // Calculate scale
        const padding = 10;
        const scaleX = (canvas.width - padding * 2) / extent.w;
        const scaleY = (canvas.height - padding * 2) / extent.h;
        const scale = Math.min(scaleX, scaleY);
        
        // Center offset
        const offsetX = (canvas.width - extent.w * scale) / 2 - extent.x1 * scale;
        const offsetY = (canvas.height - extent.h * scale) / 2 - extent.y1 * scale;
        
        // Draw edges - show all edges regardless of visibility
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
        ctx.lineWidth = 1;
        cy.edges().forEach((edge: any) => {
            const source = edge.source().position();
            const target = edge.target().position();
            
            ctx.beginPath();
            ctx.moveTo(source.x * scale + offsetX, source.y * scale + offsetY);
            ctx.lineTo(target.x * scale + offsetX, target.y * scale + offsetY);
            ctx.stroke();
        });
        
        // Draw nodes as rectangles matching their actual shape - show all nodes regardless of visibility/opacity
        cy.nodes().forEach((node: any) => {
            const pos = node.position();
            const nodeWidth = node.width();
            const nodeHeight = node.height();
            const width = Math.max(2, nodeWidth * scale);
            const height = Math.max(2, nodeHeight * scale);
            const x = (pos.x * scale + offsetX) - width / 2;
            const y = (pos.y * scale + offsetY) - height / 2;
            
            // Use node color but ensure visibility on minimap
            const nodeColor = node.style('background-color') || 'rgba(100, 150, 255, 0.8)';
            ctx.fillStyle = nodeColor;
            ctx.globalAlpha = 0.8; // Ensure nodes are visible on minimap
            ctx.fillRect(x, y, width, height);
            ctx.globalAlpha = 1.0; // Reset alpha
        });
        
        // Draw viewport rectangle with subtle styling
        const pan = cy.pan();
        const zoom = cy.zoom();
        const vpWidth = cy.width() / zoom;
        const vpHeight = cy.height() / zoom;
        const vpX = -pan.x / zoom;
        const vpY = -pan.y / zoom;
        
        // Fill with subtle overlay
        ctx.fillStyle = 'rgba(100, 150, 200, 0.15)';
        ctx.fillRect(
            vpX * scale + offsetX,
            vpY * scale + offsetY,
            vpWidth * scale,
            vpHeight * scale
        );
        
        // Border with subtle color
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            vpX * scale + offsetX,
            vpY * scale + offsetY,
            vpWidth * scale,
            vpHeight * scale
        );
    }
    
    /**
     * Handle minimap click
     */
    private handleMinimapClick(e: MouseEvent): void {
        if (!this.minimapCanvas) return;
        
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const canvas = this.minimapCanvas;
        const rect = canvas.getBoundingClientRect();
        
        // Get click position relative to canvas (accounting for HiDPI)
        const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Get graph bounds from all elements (same as updateMinimap)
        const extent = cy.elements().boundingBox();
        if (!extent.w || !extent.h) return;
        
        const padding = 10;
        const scaleX = (canvas.width - padding * 2) / extent.w;
        const scaleY = (canvas.height - padding * 2) / extent.h;
        const scale = Math.min(scaleX, scaleY);
        
        const offsetX = (canvas.width - extent.w * scale) / 2 - extent.x1 * scale;
        const offsetY = (canvas.height - extent.h * scale) / 2 - extent.y1 * scale;
        
        // Convert minimap canvas coordinates to graph coordinates
        const graphX = (clickX - offsetX) / scale;
        const graphY = (clickY - offsetY) / scale;
        
        // Get current zoom level to preserve it
        const currentZoom = cy.zoom();
        const viewportWidth = cy.width();
        const viewportHeight = cy.height();
        
        // Calculate the pan position to center the clicked point in the viewport
        // Pan is the offset from graph origin to viewport center
        const newPan = {
            x: viewportWidth / 2 - graphX * currentZoom,
            y: viewportHeight / 2 - graphY * currentZoom
        };
        
        // Pan to clicked position without changing zoom
        cy.animate({
            pan: newPan,
            zoom: currentZoom,
            duration: 300,
            easing: 'ease-out'
        });
    }
    
    /**
     * Initialize layer selector dropdown
     */
    private initLayerSelector(): void {
        const layerSelect = document.getElementById('layerSelect') as HTMLSelectElement;
        
        if (!layerSelect) {
            logMessage(this.vscode, '[UIController] Layer selector not found');
            return;
        }
        
        // Handle layer selection change
        layerSelect.addEventListener('change', () => {
            const selectedLayer = layerSelect.value;
            logMessage(this.vscode, `[UIController] Layer changed to: ${selectedLayer}`);
            
            // Post message to extension to change layer
            this.vscode.postMessage({
                type: 'changeLayer',
                layer: selectedLayer
            });
        });
        
        logMessage(this.vscode, '[UIController] ✓ Layer selector initialized');
    }
    
    /**
     * Update the layer selector to match current layer
     * Called when layer changes externally (e.g., from Command Palette)
     */
    public updateLayerSelector(layer: string): void {
        const layerSelect = document.getElementById('layerSelect') as HTMLSelectElement;
        
        if (layerSelect && layerSelect.value !== layer) {
            layerSelect.value = layer;
            logMessage(this.vscode, `[UIController] Layer selector updated to: ${layer}`);
        }
    }
    
}



