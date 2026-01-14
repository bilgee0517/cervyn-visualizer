/**
 * Webview template helper
 * Handles loading and rendering the webview HTML template
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CYTOSCAPE_STYLES } from '../config/cytoscape-styles';
import { getLayoutConfig } from '../config/layout-config';
import { WEBVIEW_CONFIG, LIBRARY_VERSIONS } from '../config/constants';

export class WebviewTemplate {
    constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * Generate nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Get HTML content for webview
     */
    public getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this.getNonce();

        // Load HTML template
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Get URIs
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'styles.css')
        );
        
        // Load compiled TypeScript output
        const mainScriptPath = path.join(this.extensionUri.fsPath, 'out', 'webview', 'main.js');
        if (!fs.existsSync(mainScriptPath)) {
            throw new Error(`Compiled webview script not found: ${mainScriptPath}. Please run 'npm run compile' first.`);
        }
        let mainScript = fs.readFileSync(mainScriptPath, 'utf8');

        // External library URIs
        const cytoscapeUri = `https://unpkg.com/cytoscape@${LIBRARY_VERSIONS.CYTOSCAPE}/dist/cytoscape.min.js`;
        const dagreUri = `https://unpkg.com/dagre@${LIBRARY_VERSIONS.DAGRE}/dist/dagre.min.js`;
        const cytoscapeDagreUri = `https://unpkg.com/cytoscape-dagre@${LIBRARY_VERSIONS.CYTOSCAPE_DAGRE}/cytoscape-dagre.js`;
        
        // fCoSE and its dependencies
        const layoutBaseUri = `https://unpkg.com/layout-base@${LIBRARY_VERSIONS.LAYOUT_BASE}/layout-base.js`;
        const coseBaseUri = `https://unpkg.com/cose-base@${LIBRARY_VERSIONS.COSE_BASE}/cose-base.js`;
        const cytoscapeFcoseUri = `https://unpkg.com/cytoscape-fcose@${LIBRARY_VERSIONS.CYTOSCAPE_FCOSE}/cytoscape-fcose.js`;

        // Inject Cytoscape styles and layout config into the script
        mainScript = mainScript
            .replace('{{cytoscapeStyles}}', JSON.stringify(CYTOSCAPE_STYLES))
            .replace('{{getLayoutConfig}}', this.getLayoutConfigFunction());

        // Create inline script URI
        const mainScriptUri = this.createInlineScriptDataUri(mainScript, nonce);

        // Replace placeholders in HTML
        html = html
            .replace(/{{nonce}}/g, nonce)
            .replace('{{cspSource}}', webview.cspSource)
            .replace('{{styleUri}}', styleUri.toString())
            .replace('{{cytoscapeUri}}', cytoscapeUri)
            .replace('{{dagreUri}}', dagreUri)
            .replace('{{cytoscapeDagreUri}}', cytoscapeDagreUri)
            .replace('{{layoutBaseUri}}', layoutBaseUri)
            .replace('{{coseBaseUri}}', coseBaseUri)
            .replace('{{cytoscapeFcoseUri}}', cytoscapeFcoseUri)
            .replace('{{mainScriptUri}}', mainScriptUri);

        return html;
    }

    /**
     * Create data URI for inline script
     */
    private createInlineScriptDataUri(script: string, nonce: string): string {
        const encoded = Buffer.from(script).toString('base64');
        return `data:text/javascript;base64,${encoded}`;
    }

    /**
     * Generate layout config function as string
     */
    private getLayoutConfigFunction(): string {
        return `function(layoutName, visibleNodeCount) {
            const baseConfig = {
                animate: true,
                animationDuration: 500,
                fit: true,
                padding: 100,
                spacingFactor: 2.0,
                avoidOverlap: true,
                nodeDimensionsIncludeLabels: true
            };

            const configs = {
                dagre: {
                    ...baseConfig,
                    name: 'dagre',
                    rankDir: 'TB',
                    rankSep: 200,
                    nodeSep: 150,
                    edgeSep: 80,
                    ranker: 'network-simplex',
                    spacingFactor: visibleNodeCount < 10 ? 2.5 : 2.0
                },
                concentric: {
                    ...baseConfig,
                    name: 'concentric',
                    concentric: node => {
                        if (node.data('isEntryPoint')) return 10;
                        if (node.data('type') === 'directory') return 7;
                        if (node.data('type') === 'file') return 5;
                        return 3;
                    },
                    levelWidth: () => 2,
                    minNodeSpacing: 150,
                    startAngle: 0,
                    sweep: 2 * Math.PI,
                    equidistant: true
                },
                grid: {
                    ...baseConfig,
                    name: 'grid',
                    rows: undefined,
                    cols: undefined,
                    position: node => node.position(),
                    condense: false,
                    avoidOverlapPadding: 80
                },
                cose: {
                    ...baseConfig,
                    name: 'cose',
                    nodeRepulsion: 1200000,
                    nodeOverlap: 150,
                    idealEdgeLength: 200,
                    edgeElasticity: 100,
                    nestingFactor: 1.5,
                    gravity: 0.5,
                    numIter: 2500,
                    initialTemp: 200,
                    coolingFactor: 0.95,
                    minTemp: 1.0
                },
                circle: {
                    ...baseConfig,
                    name: 'circle',
                    radius: undefined,
                    startAngle: -Math.PI / 2,
                    sweep: 2 * Math.PI,
                    clockwise: true,
                    spacingFactor: 2.5
                },
                fcose: {
                    ...baseConfig,
                    name: 'fcose',
                    quality: 'default',
                    randomize: true,
                    animate: true,
                    animationDuration: 1000,
                    nodeDimensionsIncludeLabels: true,
                    uniformNodeDimensions: false,
                    packComponents: false,
                    samplingType: true,
                    sampleSize: 25,
                    nodeSeparation: 100,
                    piTol: 0.0000001,
                    nodeRepulsion: node => {
                        const isCompound = node.data('isCompound');
                        const sizeMultiplier = node.data('sizeMultiplier') || 1.0;
                        if (isCompound) {
                            return 4500 * Math.max(sizeMultiplier, 2.0);
                        }
                        return 4500;
                    },
                    idealEdgeLength: edge => {
                        const source = edge.source();
                        const target = edge.target();
                        const sourceSize = source.data('sizeMultiplier') || 1.0;
                        const targetSize = target.data('sizeMultiplier') || 1.0;
                        const avgSize = (sourceSize + targetSize) / 2;
                        return 50 * Math.max(avgSize, 1.0);
                    },
                    edgeElasticity: () => 0.45,
                    nestingFactor: 1.2,
                    numIter: 3500,
                    tile: true,
                    tilingPaddingVertical: 20,
                    tilingPaddingHorizontal: 20,
                    gravity: 0.25,
                    gravityRange: 3.8,
                    gravityCompound: 1.5,
                    gravityRangeCompound: 2.5,
                    initialEnergyOnIncremental: 0.3
                }
            };

            return configs[layoutName] || configs.fcose;
        }`;
    }
}

