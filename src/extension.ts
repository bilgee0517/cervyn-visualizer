import * as vscode from 'vscode';
import { GraphService } from './services/GraphService';
import { CodeAnalyzer } from './services/CodeAnalyzer';
import { LayoutType } from './types';
import { initializeOutputChannel, log, critical, outputChannel } from './logger';
import { handleError, errorBoundary, generateCorrelationId } from './utils/error-handler';
import { RendererFactory } from './renderers/RendererFactory';
import { IGraphRenderer } from './renderers/IGraphRenderer';
import { ConfigurationError } from './errors';

let rendererFactory: RendererFactory;
let graphViewProvider: IGraphRenderer;

export function activate(context: vscode.ExtensionContext) {
    const correlationId = generateCorrelationId();
    
    try {
        // Initialize output channel first
        initializeOutputChannel();
        log('Codebase Visualizer extension is now active', () => ({ correlationId }));
        if (outputChannel) {
            context.subscriptions.push(outputChannel);
        }

        // Initialize services
        const graphService = new GraphService(context);
        const codeAnalyzer = new CodeAnalyzer();
        
        log('Services initialized', () => ({ correlationId }));

        // Initialize renderer factory
        rendererFactory = new RendererFactory(context.extensionUri, graphService, codeAnalyzer);
        
        // Get initial renderer (will auto-select based on config)
        graphViewProvider = rendererFactory.getRenderer();
        
        log(`✓ Renderer initialized: ${graphViewProvider.getRendererType().toUpperCase()}`, () => ({ 
            correlationId,
            rendererType: graphViewProvider.getRendererType()
        }))

    // Register the webview view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'codebaseVisualizerView',
            graphViewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.showGraph', () => {
            graphViewProvider.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.refresh', async () => {
            const result = await errorBoundary(
                async () => {
                    await graphViewProvider.refresh();
                    vscode.window.showInformationMessage('Graph refreshed');
                },
                {
                    operation: 'refresh graph',
                    component: 'Extension',
                    correlationId: generateCorrelationId()
                }
            );
            
            if (!result.ok) {
                vscode.window.showErrorMessage(`Failed to refresh graph: ${result.error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.setLayout', async () => {
            const result = await errorBoundary(
                async () => {
                    const layouts = ['fcose', 'swimlane', 'dagre', 'concentric', 'grid', 'cose', 'circle'];
                    const selected = await vscode.window.showQuickPick(layouts, {
                        placeHolder: 'Select a layout algorithm'
                    });
                    if (selected) {
                        graphViewProvider.setLayout(selected as LayoutType);
                    }
                },
                {
                    operation: 'set layout',
                    component: 'Extension',
                    correlationId: generateCorrelationId()
                }
            );
            
            if (!result.ok) {
                vscode.window.showErrorMessage(`Failed to set layout: ${result.error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.setLayer', async () => {
            // NOTE: Currently, only 'implementation' layer is fully developed.
            // Other layers (blueprint, architecture, dependencies) have basic implementations
            // and will be enhanced with more sophisticated visualizations in future updates.
            const layers = [
                { label: '📋 Blueprint', value: 'blueprint', description: 'High-level architecture overview (basic implementation - will be enhanced later)' },
                { label: '🏗️ Architecture', value: 'architecture', description: 'Component structure and relationships (basic implementation - will be enhanced later)' },
                { label: '⚙️ Implementation', value: 'implementation', description: 'Detailed code structure (fully implemented)' },
                { label: '🔗 Dependencies', value: 'dependencies', description: 'External and internal dependencies (basic implementation - will be enhanced later)' }
            ];
            const selected = await vscode.window.showQuickPick(layers, {
                placeHolder: 'Select visualization layer'
            });
            if (selected) {
                graphViewProvider.setLayer(selected.value as any);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.exportGraph', async () => {
            const result = await errorBoundary(
                async () => {
                    const formats = ['JSON', 'PNG (coming soon)', 'SVG (coming soon)'];
                    const selected = await vscode.window.showQuickPick(formats, {
                        placeHolder: 'Select export format'
                    });
                    if (selected === 'JSON') {
                        await graphViewProvider.exportGraph();
                    }
                },
                {
                    operation: 'export graph',
                    component: 'Extension',
                    correlationId: generateCorrelationId()
                }
            );
            
            if (!result.ok) {
                vscode.window.showErrorMessage(`Failed to export graph: ${result.error.message}`);
            }
        })
    );

    // ============================================================================
    // PROPOSED CHANGES COMMANDS - AI Agent Integration
    // ============================================================================

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.proposeChange', async () => {
            // Prompt for node ID or file path
            const nodeId = await vscode.window.showInputBox({
                prompt: 'Enter node ID or file path',
                placeHolder: 'e.g., file-src/App.tsx or src/App.tsx'
            });
            
            if (!nodeId) return;
            
            // Prompt for change details
            const changeName = await vscode.window.showInputBox({
                prompt: 'Change name/title',
                placeHolder: 'e.g., Add authentication logic'
            });
            
            if (!changeName) return;
            
            const changeSummary = await vscode.window.showInputBox({
                prompt: 'Summary of changes (optional)',
                placeHolder: 'Brief description of what changed'
            });
            
            const changeIntention = await vscode.window.showInputBox({
                prompt: 'Why this change? (optional)',
                placeHolder: 'Rationale or motivation'
            });
            
            // Add proposed change
            if (nodeId.includes('/') || nodeId.includes('\\')) {
                // Looks like a file path
                graphService.addProposedChangeForFile(nodeId, {
                    name: changeName,
                    summary: changeSummary,
                    intention: changeIntention
                });
            } else {
                // Node ID
                graphService.addProposedChangeForNode(nodeId, {
                    name: changeName,
                    summary: changeSummary,
                    intention: changeIntention
                });
            }
            
            vscode.window.showInformationMessage(`Proposed change added for: ${nodeId}`);
            graphViewProvider.refresh(); // Refresh to show changes
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.applyProposedChanges', async () => {
            const result = graphService.applyProposedChanges();
            
            if (result.appliedCount === 0 && result.notFoundCount === 0) {
                vscode.window.showInformationMessage('No proposed changes to apply');
            } else {
                vscode.window.showInformationMessage(
                    `Applied ${result.appliedCount} change(s). ${result.notFoundCount > 0 ? `${result.notFoundCount} node(s) not found.` : ''}`
                );
                graphViewProvider.refresh(); // Refresh to show applied changes
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.listProposedChanges', async () => {
            const changes = graphService.listProposedChanges();
            
            if (changes.length === 0) {
                vscode.window.showInformationMessage('No proposed changes');
                return;
            }
            
            // Show as quick pick
            const items = changes.map(change => ({
                label: change.name || 'Unnamed change',
                description: change.nodeId || change.filePath,
                detail: change.summary,
                change: change
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `${changes.length} proposed change(s)`,
                canPickMany: false
            });
            
            if (selected) {
                // Show details
                const details = [
                    `Node/File: ${selected.change.nodeId || selected.change.filePath}`,
                    `Name: ${selected.change.name || 'N/A'}`,
                    `Summary: ${selected.change.summary || 'N/A'}`,
                    `Intention: ${selected.change.intention || 'N/A'}`,
                    `Timestamp: ${selected.change.timestamp ? new Date(selected.change.timestamp).toLocaleString() : 'N/A'}`
                ].join('\n');
                
                vscode.window.showInformationMessage(details, { modal: true });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.clearProposedChanges', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all proposed changes?',
                { modal: true },
                'Yes', 'No'
            );
            
            if (confirm === 'Yes') {
                graphService.clearAllProposedChanges();
                vscode.window.showInformationMessage('All proposed changes cleared');
                graphViewProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.refreshGraph', async () => {
            log('[Extension] refreshGraph command called');
            try {
                const confirm = await vscode.window.showWarningMessage(
                    'This will clear all graph data, state, and restart from scratch. Continue?',
                    { modal: true },
                    'Yes', 'No'
                );
                
                log(`[Extension] User confirmation: ${confirm}`);
                
                if (confirm === 'Yes') {
                    log('[Extension] User confirmed, clearing state...');
                    vscode.window.showInformationMessage('Clearing graph state...');
                    await graphService.clearAllState();
                    log('[Extension] State cleared, refreshing graph...');
                    vscode.window.showInformationMessage('Graph state cleared. Refreshing...');
                    await graphViewProvider.refresh();
                    log('[Extension] Graph refreshed successfully');
                    vscode.window.showInformationMessage('Graph refreshed successfully');
                } else {
                    log('[Extension] User cancelled refresh');
                }
            } catch (err) {
                handleError(err, {
                    component: 'Extension',
                    operation: 'refreshGraph',
                    correlationId: generateCorrelationId()
                }, true);
            }
        })
    );

    // Watch for file changes and auto-refresh
    const config = vscode.workspace.getConfiguration('codebaseVisualizer');
    if (config.get('autoRefresh')) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,tsx,jsx,py,java}');
        
        // Debounce file changes to batch rapid saves (500ms delay)
        let fileChangeDebounceTimer: NodeJS.Timeout | undefined;
        const pendingFileChanges = new Set<string>(); // Track which files changed
        
        const handleFileChange = async (uri: vscode.Uri) => {
            const filePath = uri.fsPath;
            pendingFileChanges.add(filePath);
            
            // Clear existing timer
            if (fileChangeDebounceTimer) {
                clearTimeout(fileChangeDebounceTimer);
            }
            
            // Debounce: wait 500ms after last change before processing
            fileChangeDebounceTimer = setTimeout(async () => {
                const filesToProcess = Array.from(pendingFileChanges);
                pendingFileChanges.clear();
                fileChangeDebounceTimer = undefined;
                
                log(`[Extension] Processing ${filesToProcess.length} file change(s) after debounce`);
                
                // Process the most recent file (or all if needed)
                // For now, process the last changed file to avoid multiple analyses
                const fileToProcess = filesToProcess[filesToProcess.length - 1];
                
                try {
                    // Use incremental update if file path is available
                    await graphViewProvider.refresh(fileToProcess);
                } catch (error) {
                    log(`[Extension] Error processing file change: ${error}`);
                }
            }, 500); // 500ms debounce
        };
        
        watcher.onDidChange(handleFileChange);
        watcher.onDidCreate(handleFileChange);
        watcher.onDidDelete(handleFileChange);
        context.subscriptions.push(watcher);
        
        // Cleanup timer on deactivation
        context.subscriptions.push({
            dispose: () => {
                if (fileChangeDebounceTimer) {
                    clearTimeout(fileChangeDebounceTimer);
                }
            }
        });
    }
    
    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('codebaseVisualizer')) {
                const correlationId = generateCorrelationId();
                log('[Extension] Configuration changed, reloading renderer factory...', () => ({ correlationId }));
                
                try {
                    rendererFactory.reloadConfig();
                } catch (err) {
                    const error = new ConfigurationError(
                        'Failed to reload configuration',
                        'codebaseVisualizer',
                        undefined,
                        { correlationId },
                        err instanceof Error ? err : undefined
                    );
                    handleError(error, {
                        operation: 'reload configuration',
                        component: 'Extension',
                        correlationId
                    }, true);
                }
            }
        })
    );

    // Don't refresh on startup - let the webview signal when it's ready
    // The 'ready' message from webview will trigger initial refresh
    log('[Extension] Waiting for webview to signal ready...');
    
    log('[Extension] Activation complete!', () => ({ correlationId }));
    } catch (err) {
        critical('Extension activation failed', err, () => ({
            component: 'Extension',
            operation: 'activate',
            correlationId
        }));
        throw err;
    }
}

export function deactivate() {
    log('Codebase Visualizer extension is now deactivated');
    outputChannel?.dispose();
}

