/**
 * Webview State Persistence Service
 * 
 * Manages persistence of webview UI state (zoom, pan, layout preferences)
 * using VS Code's built-in webview state API.
 * 
 * This is separate from the graph data state - it only persists UI preferences
 * to provide a seamless user experience across sessions.
 */

import { log, debug } from '../logger';
import { Layer, LayoutType } from '../types';

export interface WebviewState {
    /** Current zoom level */
    zoom?: number;
    /** Camera/viewport position */
    pan?: { x: number; y: number };
    /** Current layout algorithm */
    layout?: LayoutType;
    /** Current layer */
    layer?: Layer;
    /** Whether the graph is collapsed */
    collapsed?: boolean;
    /** Selected node IDs */
    selectedNodeIds?: string[];
    /** Custom user preferences */
    preferences?: {
        /** Auto-fit on load */
        autoFit?: boolean;
        /** Show edge labels */
        showEdgeLabels?: boolean;
        /** Animation speed */
        animationSpeed?: 'slow' | 'normal' | 'fast' | 'none';
    };
    /** Last updated timestamp */
    lastUpdated?: number;
}

/**
 * WebviewStatePersistence manages UI state for the webview
 * This state is persisted by VS Code and survives extension reloads
 */
export class WebviewStatePersistence {
    private currentState: WebviewState = {};
    
    constructor() {
        log('[WebviewStatePersistence] Initialized');
    }
    
    /**
     * Get the current webview state
     */
    public getState(): WebviewState {
        return { ...this.currentState };
    }
    
    /**
     * Update webview state (partial update)
     * @param state Partial state to merge with current state
     */
    public updateState(state: Partial<WebviewState>): void {
        this.currentState = {
            ...this.currentState,
            ...state,
            lastUpdated: Date.now()
        };
        
        debug(`[WebviewStatePersistence] State updated`, () => ({
            keys: Object.keys(state),
            zoom: this.currentState.zoom,
            layout: this.currentState.layout,
            layer: this.currentState.layer
        }));
    }
    
    /**
     * Set complete webview state (full replace)
     * @param state Complete state to set
     */
    public setState(state: WebviewState): void {
        this.currentState = {
            ...state,
            lastUpdated: Date.now()
        };
        
        log(`[WebviewStatePersistence] State set`, () => ({
            zoom: state.zoom,
            layout: state.layout,
            layer: state.layer
        }));
    }
    
    /**
     * Clear webview state (reset to defaults)
     */
    public clearState(): void {
        this.currentState = {};
        log('[WebviewStatePersistence] State cleared');
    }
    
    /**
     * Get zoom level
     */
    public getZoom(): number | undefined {
        return this.currentState.zoom;
    }
    
    /**
     * Set zoom level
     */
    public setZoom(zoom: number): void {
        this.updateState({ zoom });
    }
    
    /**
     * Get camera/viewport position
     */
    public getPan(): { x: number; y: number } | undefined {
        return this.currentState.pan;
    }
    
    /**
     * Set camera/viewport position
     */
    public setPan(pan: { x: number; y: number }): void {
        this.updateState({ pan });
    }
    
    /**
     * Get current layout
     */
    public getLayout(): LayoutType | undefined {
        return this.currentState.layout;
    }
    
    /**
     * Set current layout
     */
    public setLayout(layout: LayoutType): void {
        this.updateState({ layout });
    }
    
    /**
     * Get current layer
     */
    public getLayer(): Layer | undefined {
        return this.currentState.layer;
    }
    
    /**
     * Set current layer
     */
    public setLayer(layer: Layer): void {
        this.updateState({ layer });
    }
    
    /**
     * Get user preferences
     */
    public getPreferences(): WebviewState['preferences'] {
        return this.currentState.preferences || {};
    }
    
    /**
     * Update user preferences (partial update)
     */
    public updatePreferences(preferences: Partial<WebviewState['preferences']>): void {
        this.updateState({
            preferences: {
                ...this.currentState.preferences,
                ...preferences
            }
        });
    }
    
    /**
     * Serialize state for persistence
     * Returns a JSON string suitable for storage
     */
    public serialize(): string {
        return JSON.stringify(this.currentState);
    }
    
    /**
     * Deserialize state from storage
     * @param json JSON string from storage
     * @returns true if successful, false otherwise
     */
    public deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            
            // Validate that it's a valid WebviewState
            if (typeof state !== 'object' || state === null) {
                log('[WebviewStatePersistence] Invalid state format - not an object');
                return false;
            }
            
            this.setState(state);
            log('[WebviewStatePersistence] ✓ State deserialized successfully');
            return true;
        } catch (err) {
            log(`[WebviewStatePersistence] Failed to deserialize state: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }
    
    /**
     * Create default state
     */
    public static createDefaultState(): WebviewState {
        return {
            zoom: 1.0,
            pan: { x: 0, y: 0 },
            layout: 'fcose',
            layer: 'code',
            collapsed: false,
            selectedNodeIds: [],
            preferences: {
                autoFit: true,
                showEdgeLabels: false,
                animationSpeed: 'normal'
            },
            lastUpdated: Date.now()
        };
    }
    
    /**
     * Check if state is valid (has required fields)
     */
    public isValid(): boolean {
        // State is valid if it's not empty or has at least one meaningful field
        return Object.keys(this.currentState).length > 0;
    }
    
    /**
     * Get age of state in milliseconds
     */
    public getAge(): number | null {
        if (!this.currentState.lastUpdated) {
            return null;
        }
        return Date.now() - this.currentState.lastUpdated;
    }
}

// Create a factory function for creating instances
export function createWebviewStatePersistence(): WebviewStatePersistence {
    return new WebviewStatePersistence();
}
