/**
 * Centralized state management for the webview
 */

export class StateManager {
    // Cytoscape instance
    private cy: any = null;
    
    // Configuration
    private cytoscapeStyles: any = null;
    private layoutConfigFn: ((layoutName: string, nodeCount: number) => any) | null = null;
    private isConfigReady = false;
    
    // Expand level (0-3)
    private expandLevel: number = 0;
    
    // UI state
    private hasSeenOnboarding = false;
    
    // Getters
    getCy(): any { return this.cy; }
    getCytoscapeStyles(): any { return this.cytoscapeStyles; }
    getLayoutConfig(): ((layoutName: string, nodeCount: number) => any) | null { return this.layoutConfigFn; }
    isReady(): boolean { return this.isConfigReady; }
    hasUserSeenOnboarding(): boolean { return this.hasSeenOnboarding; }
    getExpandLevel(): number { return this.expandLevel; }
    
    // Setters
    setCy(cy: any): void { this.cy = cy; }
    setCytoscapeStyles(styles: any): void { this.cytoscapeStyles = styles; }
    setLayoutConfig(fn: (layoutName: string, nodeCount: number) => any): void { this.layoutConfigFn = fn; }
    setConfigReady(ready: boolean): void { this.isConfigReady = ready; }
    setHasSeenOnboarding(seen: boolean): void { this.hasSeenOnboarding = seen; }
    
    // Expand level methods
    incrementExpandLevel(): void {
        this.expandLevel++;
        if (this.expandLevel > 3) {
            this.expandLevel = 3;
        }
    }
    
    resetExpandLevel(): void {
        this.expandLevel = 0;
    }
}

// Singleton instance
export const stateManager = new StateManager();

