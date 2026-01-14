/**
 * Type definitions for VS Code webview API
 */
declare function acquireVsCodeApi(): {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
};

// Global types for browser environment
declare const cytoscape: any;
declare const dagre: any;

