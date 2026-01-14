import * as vscode from 'vscode';
import { IGraphRenderer } from './IGraphRenderer';
import { CytoscapeRenderer } from './cytoscape/CytoscapeRenderer';
import { GraphService } from '../services/GraphService';
import { CodeAnalyzer } from '../services/CodeAnalyzer';
import { log } from '../logger';

/**
 * Configuration for renderer behavior
 */
export interface RendererConfig {
    /** Always uses Cytoscape renderer */
    preferredRenderer: 'cytoscape';
}

/**
 * Factory for creating and managing graph renderers.
 * Uses Cytoscape renderer for all graphs.
 */
export class RendererFactory {
    private currentRenderer: IGraphRenderer | null = null;
    private config: RendererConfig;
    
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly graphService: GraphService,
        private readonly codeAnalyzer: CodeAnalyzer
    ) {
        this.config = this.loadConfig();
        log(`[RendererFactory] Initialized with Cytoscape renderer`);
    }

    /**
     * Load renderer configuration from VS Code settings
     */
    private loadConfig(): RendererConfig {
        return {
            preferredRenderer: 'cytoscape'
        };
    }

    /**
     * Create or get the Cytoscape renderer
     */
    public getRenderer(nodeCount?: number): IGraphRenderer {
        // If we already have a renderer, return it
        if (this.currentRenderer) {
            return this.currentRenderer;
        }
        
        // Create new renderer
        log(`[RendererFactory] Creating Cytoscape renderer`);
        this.currentRenderer = new CytoscapeRenderer(this.extensionUri, this.graphService, this.codeAnalyzer);
        
        return this.currentRenderer;
    }

    /**
     * Check if renderer should be switched - always returns false since we only use Cytoscape
     */
    public shouldSwitchRenderer(): boolean {
        return false;
    }

    /**
     * Reload configuration from settings
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
        log(`[RendererFactory] Config reloaded`);
    }

    /**
     * Get current renderer type
     */
    public getCurrentRendererType(): 'cytoscape' | null {
        return this.currentRenderer?.getRendererType() || null;
    }
}














