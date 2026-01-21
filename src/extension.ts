import * as vscode from 'vscode';
import { GraphService } from './services/GraphService';
import { CodeAnalyzer } from './services/CodeAnalyzer';
import { LayoutType } from './types';
import { initializeOutputChannel, log, critical, outputChannel } from './logger';
import { handleError, errorBoundary, generateCorrelationId } from './utils/error-handler';
import { RendererFactory } from './renderers/RendererFactory';
import { IGraphRenderer } from './renderers/IGraphRenderer';
import { ConfigurationError } from './errors';
import { stateBackupService } from './services/StateBackupService';

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
        
        // Reconcile state with file system on startup (prune orphaned entries)
        graphService.reconcileStateWithFilesystem().catch(err => {
            handleError(err, {
                component: 'Extension',
                operation: 'reconcileStateWithFilesystem',
                correlationId: generateCorrelationId()
            });
        });

        // Initialize renderer factory with extension context for state persistence
        rendererFactory = new RendererFactory(context.extensionUri, graphService, codeAnalyzer, context);
        
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
            // Multi-Layer Visualization: Workflow (features) + C4 Model (architecture)
            const layers = [
                { label: 'Workflow', value: 'workflow', description: 'User-facing features and capabilities' },
                { label: 'Context', value: 'context', description: 'External dependencies and system boundaries' },
                { label: 'Container', value: 'container', description: 'High-level application architecture' },
                { label: 'Component', value: 'component', description: 'Internal modules and packages' },
                { label: 'Code', value: 'code', description: 'Classes, functions, methods (auto-populated)' }
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
                    log('[Extension] State cleared, switching to code layer and refreshing...');
                    
                    // Always switch to code layer after refresh (it's the only implemented layer)
                    graphViewProvider.setLayer('code');
                    
                    vscode.window.showInformationMessage('Graph state cleared. Refreshing code layer...');
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

    // Recovery command for restoring state from backups
    context.subscriptions.push(
        vscode.commands.registerCommand('codebaseVisualizer.recoverState', async () => {
            log('[Extension] recoverState command called');
            try {
                const backups = await stateBackupService.listBackups();
                
                if (backups.length === 0) {
                    vscode.window.showInformationMessage('No backups available');
                    return;
                }
                
                // Show backup list as quick pick
                const items = backups.map(backup => ({
                    label: backup.filename,
                    description: `${(backup.size / 1024).toFixed(2)} KB`,
                    detail: `Created: ${backup.timestamp.toLocaleString()}`,
                    backup: backup
                }));
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Select a backup to restore (${backups.length} available)`,
                    canPickMany: false
                });
                
                if (!selected) {
                    return; // User cancelled
                }
                
                // Confirm restoration
                const confirm = await vscode.window.showWarningMessage(
                    `Restore state from backup: ${selected.label}?\n\nThis will replace the current state. A safety backup will be created.`,
                    { modal: true },
                    'Restore', 'Cancel'
                );
                
                if (confirm !== 'Restore') {
                    return;
                }
                
                // Restore the backup
                await stateBackupService.restoreBackup(selected.backup.fullPath);
                
                vscode.window.showInformationMessage(
                    `State restored from backup: ${selected.label}. Reloading...`
                );
                
                // Refresh the graph view to show restored state
                await graphViewProvider.refresh();
                
                log('[Extension] State recovered successfully');
            } catch (err) {
                handleError(err, {
                    component: 'Extension',
                    operation: 'recoverState',
                    correlationId: generateCorrelationId()
                }, true);
                vscode.window.showErrorMessage(
                    `Failed to recover state: ${err instanceof Error ? err.message : String(err)}`
                );
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
        
        const handleFileChange = async (uri: vscode.Uri, eventType: 'change' | 'create' | 'delete') => {
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
                
                log(`[Extension] Processing ${filesToProcess.length} file change(s) after debounce (event: ${eventType})`);
                
                // Process the most recent file (or all if needed)
                // For now, process the last changed file to avoid multiple analyses
                const fileToProcess = filesToProcess[filesToProcess.length - 1];
                
                try {
                    // Use incremental update if file path is available
                    // refreshIncremental will detect if file doesn't exist and call removeNodesForFile
                    await graphViewProvider.refresh(fileToProcess);
                } catch (error) {
                    log(`[Extension] Error processing file change: ${error}`);
                }
            }, 500); // 500ms debounce
        };
        
        watcher.onDidChange((uri) => handleFileChange(uri, 'change'));
        watcher.onDidCreate((uri) => handleFileChange(uri, 'create'));
        watcher.onDidDelete((uri) => handleFileChange(uri, 'delete'));
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

