/**
 * UI Controller for Cytoscape webview
 * Manages toolbar buttons, controls, and UI state
 */

import { logMessage, updateZoomDisplay } from '../shared/utils';
import { StateManager } from '../shared/state-manager';
import { StyleManager } from './style-manager';

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
    private showLegend: boolean = false;
    
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
        this.initRefreshButton();
        this.initMinimap();
        this.initLegendToggle();
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
     * Initialize legend toggle button
     */
    private initLegendToggle(): void {
        const toggleLegendBtn = document.getElementById('toggleLegendBtn');
        const legendClose = document.getElementById('legendClose');
        
        if (toggleLegendBtn) {
            toggleLegendBtn.addEventListener('click', () => {
                this.closeDropdown();
                this.toggleLegend();
            });
        }
        
        if (legendClose) {
            legendClose.addEventListener('click', () => {
                this.hideLegend();
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
            
            // Update state manager with current layer
            this.stateManager.setCurrentLayer(selectedLayer);
            
            // Update legend if visible
            logMessage(this.vscode, `[UIController] Legend visible: ${this.showLegend}`);
            if (this.showLegend) {
                logMessage(this.vscode, `[UIController] Updating legend for layer: ${selectedLayer}`);
                this.renderLegend();
            }
            
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
        
        logMessage(this.vscode, `[UIController] updateLayerSelector called with layer: ${layer}, current value: ${layerSelect?.value}, showLegend: ${this.showLegend}`);
        
        if (layerSelect && layerSelect.value !== layer) {
            layerSelect.value = layer;
            logMessage(this.vscode, `[UIController] Layer selector updated to: ${layer}`);
            
            // Also update state manager
            this.stateManager.setCurrentLayer(layer);
            
            // Update legend if visible (check again after state update)
            if (this.showLegend) {
                logMessage(this.vscode, `[UIController] Updating legend for external layer change: ${layer}`);
                this.renderLegend();
            }
        } else if (layerSelect && layerSelect.value === layer) {
            // Layer is already set, but still update state and legend if needed
            this.stateManager.setCurrentLayer(layer);
            if (this.showLegend) {
                logMessage(this.vscode, `[UIController] Layer already set, but updating legend: ${layer}`);
                this.renderLegend();
            }
        }
    }
    
    /**
     * Toggle legend visibility
     */
    private toggleLegend(): void {
        if (this.showLegend) {
            this.hideLegend();
        } else {
            this.showLegendPanel();
        }
    }
    
    /**
     * Show legend panel
     */
    private showLegendPanel(): void {
        const legendPanel = document.getElementById('legendPanel');
        if (!legendPanel) {
            logMessage(this.vscode, '[UIController] ERROR: Legend panel element not found');
            return;
        }
        
        this.showLegend = true;
        legendPanel.style.display = 'flex';
        this.renderLegend();
        logMessage(this.vscode, '[UIController] Legend panel shown');
    }
    
    /**
     * Hide legend panel
     */
    private hideLegend(): void {
        const legendPanel = document.getElementById('legendPanel');
        if (!legendPanel) return;
        
        this.showLegend = false;
        legendPanel.style.display = 'none';
        logMessage(this.vscode, 'Legend panel hidden');
    }
    
    /**
     * Render legend content based on current layer
     */
    private renderLegend(): void {
        const legendContent = document.getElementById('legendContent');
        if (!legendContent) {
            logMessage(this.vscode, '[UIController] ERROR: Legend content element not found');
            return;
        }
        
        const currentLayer = this.stateManager.getCurrentLayer() || 'code';
        logMessage(this.vscode, `[UIController] Rendering legend for layer: ${currentLayer} (showLegend=${this.showLegend})`);
        
        // Import colors for legend samples
        const COLORS = {
            nodes: {
                file: '#10B981',
                directory: '#F1F5F9',
                class: '#8B5CF6',
                function: '#64748B',
                feature: '#3B82F6',
                featureGroup: '#6366F1',
                userJourney: '#8B5CF6',
                actor: '#14B8A6',
                externalSystem: '#64748B',
                externalApi: '#06B6D4',
                externalDatastore: '#FACC15',
                externalService: '#F97316',
                service: '#22C55E',
                webApp: '#3B82F6',
                mobileApp: '#EC4899',
                apiGateway: '#6366F1',
                messageBroker: '#8B5CF6',
                datastore: '#FACC15',
                cache: '#EF4444',
                objectStore: '#64748B',
                module: '#8B5CF6',
                package: '#A855F7',
                component: '#6366F1',
                library: '#3B82F6',
                namespace: '#06B6D4',
                plugin: '#EC4899',
            },
            edges: {
                default: '#94A3B8',
                imports: '#3B82F6',
                calls: '#10B981',
                dependsOn: '#EF4444',
                extends: '#8B5CF6',
                implements: '#8B5CF6',
                dependsOnFeature: '#F43F5E',
                partOf: '#8B5CF6',
                primaryFlow: '#10B981',
                alternateFlow: '#F59E0B',
                triggers: '#06B6D4',
                uses: '#14B8A6',
                integratesWith: '#F43F5E',
                authenticatesWith: '#F97316',
                readsFrom: '#3B82F6',
                writesTo: '#6366F1',
                sendsEventTo: '#8B5CF6',
                receivesEventFrom: '#A855F7',
                httpRequest: '#3B82F6',
                rpcCall: '#06B6D4',
                dbQuery: '#FACC15',
                cacheRead: '#F87171',
                cacheWrite: '#EF4444',
                publishEvent: '#8B5CF6',
                consumeEvent: '#A78BFA',
                enqueueJob: '#F97316',
            }
        };
        
        let html = '';
        
        // Node types by layer
        const nodeTypesByLayer: Record<string, Array<{type: string, label: string, color: string, shape?: string, borderStyle?: string}>> = {
            code: [
                { type: 'directory', label: 'Directory', color: COLORS.nodes.directory, borderStyle: 'dashed' },
                { type: 'file', label: 'File', color: COLORS.nodes.file },
                { type: 'class', label: 'Class', color: COLORS.nodes.class },
                { type: 'function', label: 'Function', color: COLORS.nodes.function },
            ],
            workflow: [
                { type: 'feature', label: 'Feature', color: COLORS.nodes.feature },
                { type: 'feature-group', label: 'Feature Group', color: COLORS.nodes.featureGroup },
                { type: 'user-journey', label: 'User Journey', color: COLORS.nodes.userJourney },
            ],
            context: [
                { type: 'actor', label: 'Actor', color: COLORS.nodes.actor, shape: 'ellipse' },
                { type: 'external-system', label: 'External System', color: COLORS.nodes.externalSystem },
                { type: 'external-api', label: 'External API', color: COLORS.nodes.externalApi },
                { type: 'external-datastore', label: 'External Datastore', color: COLORS.nodes.externalDatastore },
                { type: 'external-service', label: 'External Service', color: COLORS.nodes.externalService },
            ],
            container: [
                { type: 'service', label: 'Service', color: COLORS.nodes.service },
                { type: 'web-app', label: 'Web App', color: COLORS.nodes.webApp },
                { type: 'mobile-app', label: 'Mobile App', color: COLORS.nodes.mobileApp },
                { type: 'api-gateway', label: 'API Gateway', color: COLORS.nodes.apiGateway },
                { type: 'message-broker', label: 'Message Broker', color: COLORS.nodes.messageBroker },
                { type: 'datastore', label: 'Datastore', color: COLORS.nodes.datastore },
                { type: 'cache', label: 'Cache', color: COLORS.nodes.cache },
                { type: 'object-store', label: 'Object Store', color: COLORS.nodes.objectStore },
            ],
            component: [
                { type: 'module', label: 'Module', color: COLORS.nodes.module },
                { type: 'package', label: 'Package', color: COLORS.nodes.package },
                { type: 'component', label: 'Component', color: COLORS.nodes.component },
                { type: 'library', label: 'Library', color: COLORS.nodes.library },
                { type: 'namespace', label: 'Namespace', color: COLORS.nodes.namespace },
                { type: 'plugin', label: 'Plugin', color: COLORS.nodes.plugin },
            ],
        };
        
        // Edge types by category
        const edgeTypesByCategory: Record<string, Array<{type: string, label: string, color: string, style: string}>> = {
            code: [
                { type: 'imports', label: 'Imports', color: COLORS.edges.imports, style: 'solid' },
                { type: 'calls', label: 'Calls', color: COLORS.edges.calls, style: 'dotted' },
                { type: 'depends-on', label: 'Depends On', color: COLORS.edges.dependsOn, style: 'dashed' },
                { type: 'extends', label: 'Extends', color: COLORS.edges.extends, style: 'solid' },
                { type: 'implements', label: 'Implements', color: COLORS.edges.implements, style: 'solid' },
            ],
            workflow: [
                { type: 'depends-on-feature', label: 'Depends On Feature', color: COLORS.edges.dependsOnFeature, style: 'dashed' },
                { type: 'part-of', label: 'Part Of', color: COLORS.edges.partOf, style: 'solid' },
                { type: 'primary-flow', label: 'Primary Flow', color: COLORS.edges.primaryFlow, style: 'solid' },
                { type: 'alternate-flow', label: 'Alternate Flow', color: COLORS.edges.alternateFlow, style: 'dashed' },
                { type: 'triggers', label: 'Triggers', color: COLORS.edges.triggers, style: 'solid' },
            ],
            context: [
                { type: 'uses', label: 'Uses', color: COLORS.edges.uses, style: 'solid' },
                { type: 'integrates-with', label: 'Integrates With', color: COLORS.edges.integratesWith, style: 'solid' },
                { type: 'authenticates-with', label: 'Authenticates With', color: COLORS.edges.authenticatesWith, style: 'solid' },
                { type: 'reads-from', label: 'Reads From', color: COLORS.edges.readsFrom, style: 'solid' },
                { type: 'writes-to', label: 'Writes To', color: COLORS.edges.writesTo, style: 'solid' },
                { type: 'sends-event-to', label: 'Sends Event To', color: COLORS.edges.sendsEventTo, style: 'solid' },
                { type: 'receives-event-from', label: 'Receives Event From', color: COLORS.edges.receivesEventFrom, style: 'solid' },
            ],
            container: [
                { type: 'http-request', label: 'HTTP Request', color: COLORS.edges.httpRequest, style: 'solid' },
                { type: 'rpc-call', label: 'RPC Call', color: COLORS.edges.rpcCall, style: 'solid' },
                { type: 'db-query', label: 'DB Query', color: COLORS.edges.dbQuery, style: 'solid' },
                { type: 'cache-read', label: 'Cache Read', color: COLORS.edges.cacheRead, style: 'solid' },
                { type: 'cache-write', label: 'Cache Write', color: COLORS.edges.cacheWrite, style: 'solid' },
                { type: 'publish-event', label: 'Publish Event', color: COLORS.edges.publishEvent, style: 'solid' },
                { type: 'consume-event', label: 'Consume Event', color: COLORS.edges.consumeEvent, style: 'solid' },
                { type: 'enqueue-job', label: 'Enqueue Job', color: COLORS.edges.enqueueJob, style: 'solid' },
            ],
        };
        
        // Show nodes for current layer only
        html += '<div class="legend-section">';
        html += '<div class="legend-section-title">Node Types</div>';
        html += '<div class="legend-items">';
        
        const nodeTypes = nodeTypesByLayer[currentLayer] || [];
        nodeTypes.forEach(node => {
            const shape = node.shape === 'ellipse' ? 'border-radius: 50%' : '';
            const borderStyle = node.borderStyle || 'solid';
            html += `
                <div class="legend-item">
                    <div class="legend-sample">
                        <div class="legend-node-sample" style="background-color: ${node.color}; border-color: ${node.color}; border-style: ${borderStyle}; ${shape}"></div>
                    </div>
                    <div class="legend-item-label">
                        <div>${node.label}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div></div>';
        
        // Show edges for current layer only
        html += '<div class="legend-section">';
        html += '<div class="legend-section-title">Edge Types</div>';
        html += '<div class="legend-items">';
        
        const edgeTypes = edgeTypesByCategory[currentLayer] || [];
        edgeTypes.forEach(edge => {
            html += `
                <div class="legend-item">
                    <div class="legend-sample">
                        <div class="legend-edge-sample" data-style="${edge.style}" style="--sample-color: ${edge.color}; border-top-color: ${edge.color};"></div>
                    </div>
                    <div class="legend-item-label">
                        <div>${edge.label}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div></div>';
        
        legendContent.innerHTML = html;
        logMessage(this.vscode, `[UIController] Legend content rendered for layer: ${currentLayer} (${html.length} chars, ${nodeTypes.length} node types, ${edgeTypes.length} edge types)`);
    }
    
}



