/**
 * State Synchronization Service
 * 
 * Manages reading/writing shared state between MCP server and VS Code extension.
 * Handles file locking, conflict resolution, and change notifications.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { 
    getSharedStateDir, 
    getSharedStateFile, 
    SharedGraphState, 
    createEmptySharedState 
} from '../config/shared-state-config';
import { log } from '../logger';

export class StateSyncService {
    private fileWatcher?: fs.FSWatcher;
    private lastKnownVersion: number = 0;
    private onStateChangedEmitter = new vscode.EventEmitter<SharedGraphState>();
    public readonly onStateChanged = this.onStateChangedEmitter.event;
    
    private isWriting: boolean = false; // Prevent feedback loops
    private writeDebounceTimer?: NodeJS.Timeout;
    private processingExternalChange: boolean = false; // Track if we're processing external change
    private lastProcessedVersion: number = 0; // Track last processed version to avoid duplicates
    private changeCount: number = 0; // Track number of changes processed
    private writeCount: number = 0; // Track number of writes
    private fileChangeDebounceTimer?: NodeJS.Timeout; // Debounce file watcher events
    private pollingInterval?: NodeJS.Timeout; // Polling interval for reliability
    private readonly POLLING_INTERVAL_MS = 1000; // Poll every 1 second as safety net

    constructor() {
        log(`[StateSyncService] Constructor called`);
        this.ensureStateDirectory();
        this.initializeStateFile();
        log(`[StateSyncService] Initialized. State file: ${getSharedStateFile()}`);
    }

    /**
     * Ensure the shared state directory exists
     */
    private ensureStateDirectory(): void {
        const stateDir = getSharedStateDir();
        log(`[StateSyncService] Ensuring state directory exists: ${stateDir}`);
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
            log(`[StateSyncService] ✓ Created state directory: ${stateDir}`);
        } else {
            log(`[StateSyncService] ✓ State directory already exists: ${stateDir}`);
        }
    }

    /**
     * Initialize the state file if it doesn't exist
     */
    private initializeStateFile(): void {
        const stateFile = getSharedStateFile();
        log(`[StateSyncService] Checking state file: ${stateFile}`);
        if (!fs.existsSync(stateFile)) {
            log(`[StateSyncService] State file does not exist, creating empty state...`);
            const emptyState = createEmptySharedState();
            this.writeStateInternal(emptyState);
            this.lastKnownVersion = emptyState.version;
            log(`[StateSyncService] ✓ Initialized state file: ${stateFile} (version ${emptyState.version})`);
        } else {
            // Load existing state to get current version
            try {
                const existingState = this.readState();
                if (existingState) {
                    this.lastKnownVersion = existingState.version;
                    this.lastProcessedVersion = existingState.version;
                    log(`[StateSyncService] ✓ State file exists, loaded version ${existingState.version}`);
                }
            } catch (error) {
                log(`[StateSyncService] Warning: Could not read existing state file: ${error}`);
            }
        }
    }

    /**
     * Start watching the state file for changes using Node.js fs.watch()
     * This works reliably for files outside the workspace (like ~/.codebase-visualizer/)
     */
    public startWatching(): void {
        if (this.fileWatcher) {
            log('[StateSyncService] Already watching state file, skipping...');
            return; // Already watching
        }

        const stateFile = getSharedStateFile();
        const stateDir = getSharedStateDir();

        log(`[StateSyncService] Starting to watch state file: ${stateFile}`);
        log(`[StateSyncService] Watch directory: ${stateDir}`);
        log(`[StateSyncService] Current version: ${this.lastKnownVersion}`);
        log(`[StateSyncService] isWriting flag: ${this.isWriting}`);
        log(`[StateSyncService] processingExternalChange flag: ${this.processingExternalChange}`);

        // Use Node.js fs.watch() for reliable file watching outside workspace
        // This works for any file path, not just files within VS Code workspace
        try {
            this.fileWatcher = fs.watch(stateFile, (eventType, filename) => {
                this.changeCount++;
                log(`[StateSyncService] [${this.changeCount}] File change detected!`);
                log(`  - Event type: ${eventType}`);
                log(`  - Filename: ${filename || 'unknown'}`);
                log(`  - File path: ${stateFile}`);
                log(`  - isWriting: ${this.isWriting}`);
                log(`  - processingExternalChange: ${this.processingExternalChange}`);
                log(`  - lastKnownVersion: ${this.lastKnownVersion}`);
                
                // Handle 'rename' events (file created, deleted, or renamed)
                // On some platforms, file modifications also trigger 'rename'
                if (eventType === 'rename') {
                    // Check if file still exists (might have been deleted)
                    if (!fs.existsSync(stateFile)) {
                        log('[StateSyncService] File was deleted, will recreate on next access');
                        return;
                    }
                    // File was created or renamed - treat as change
                    log('[StateSyncService] File rename event (likely create or atomic write)');
                }
                
                // Clear existing debounce timer
                if (this.fileChangeDebounceTimer) {
                    clearTimeout(this.fileChangeDebounceTimer);
                }
                
                // Debounce: wait 200ms after last change before processing
                // This batches multiple file system events that may fire for a single write
                this.fileChangeDebounceTimer = setTimeout(() => {
                    this.fileChangeDebounceTimer = undefined;
                    
                    // Verify file still exists before processing
                    if (!fs.existsSync(stateFile)) {
                        log('[StateSyncService] File no longer exists, skipping change handling');
                        return;
                    }
                    
                    if (!this.isWriting && !this.processingExternalChange) {
                        log('[StateSyncService] State file changed externally (not our write), handling change...');
                        this.handleExternalChange();
                    } else {
                        if (this.isWriting) {
                            log('[StateSyncService] Ignoring change - we are currently writing (preventing feedback loop)');
                        }
                        if (this.processingExternalChange) {
                            log('[StateSyncService] Ignoring change - we are currently processing an external change');
                        }
                    }
                }, 200); // 200ms debounce to batch rapid file system events
            });

            // Handle watcher errors (e.g., file deleted while watching)
            this.fileWatcher.on('error', (error) => {
                log(`[StateSyncService] ⚠️  File watcher error: ${error}`);
                log(`[StateSyncService] Attempting to recreate watcher...`);
                
                // Close the current watcher
                if (this.fileWatcher) {
                    this.fileWatcher.close();
                    this.fileWatcher = undefined;
                }
                
                // Retry after a short delay (file might be recreated)
                setTimeout(() => {
                    if (!this.fileWatcher) {
                        log('[StateSyncService] Retrying to start file watcher...');
                        this.startWatching();
                    }
                }, 1000);
            });

            log('[StateSyncService] ✓ Started watching state file with Node.js fs.watch()');
            
            // Start polling as a safety net to catch missed updates
            // This is a standard production pattern: file watching for responsiveness + polling for reliability
            this.startPolling();
        } catch (error) {
            log(`[StateSyncService] ❌ Error starting file watcher: ${error}`);
            if (error instanceof Error) {
                log(`[StateSyncService] Error message: ${error.message}`);
            }
            // Don't throw - allow extension to continue without file watching
            // It will still work, just won't auto-refresh on external changes
            // Still start polling as fallback
            this.startPolling();
        }
    }

    /**
     * Start polling the state file as a safety net to catch missed updates
     * This complements file watching and ensures we don't miss rapid sequential updates
     * Standard production pattern: file watching (low latency) + polling (high reliability)
     */
    private startPolling(): void {
        if (this.pollingInterval) {
            log('[StateSyncService] Already polling, skipping...');
            return;
        }

        log(`[StateSyncService] Starting polling (interval: ${this.POLLING_INTERVAL_MS}ms)`);
        
        this.pollingInterval = setInterval(() => {
            // Only poll if we're not currently writing or processing a change
            // This prevents unnecessary I/O and feedback loops
            if (!this.isWriting && !this.processingExternalChange) {
                // Optimization: Skip polling if we're already fully caught up
                // (lastProcessedVersion === lastKnownVersion means no gap to catch up on)
                if (this.lastProcessedVersion === this.lastKnownVersion && this.lastKnownVersion > 0) {
                    // Already caught up, skip file read to reduce I/O
                    return;
                }
                
                const stateFile = getSharedStateFile();
                
                // Quick check: does file exist and is it newer than our last known version?
                if (fs.existsSync(stateFile)) {
                    try {
                        // Read just the version first (lightweight check)
                        const fileContent = fs.readFileSync(stateFile, 'utf-8');
                        const state = JSON.parse(fileContent) as SharedGraphState;
                        
                        // If version is newer than what we've processed, trigger update
                        if (state.version > this.lastProcessedVersion) {
                            log(`[StateSyncService] [POLLING] Detected missed update: version ${state.version} > ${this.lastProcessedVersion}`);
                            this.handleExternalChange();
                        }
                    } catch (error) {
                        // Silently ignore polling errors (file might be locked or malformed temporarily)
                        // We don't want polling errors to spam the logs
                    }
                }
            }
        }, this.POLLING_INTERVAL_MS);
        
        log('[StateSyncService] ✓ Started polling');
    }

    /**
     * Stop polling the state file
     */
    private stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
            log('[StateSyncService] Stopped polling');
        }
    }

    /**
     * Stop watching the state file
     */
    public stopWatching(): void {
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = undefined;
            log('[StateSyncService] Stopped watching state file');
        }
        this.stopPolling();
    }

    /**
     * Handle external changes to the state file
     */
    private handleExternalChange(): void {
        const startTime = Date.now();
        log(`[StateSyncService] ========== handleExternalChange START ==========`);
        log(`  - Timestamp: ${new Date().toISOString()}`);
        log(`  - Last known version: ${this.lastKnownVersion}`);
        log(`  - Last processed version: ${this.lastProcessedVersion}`);
        
        // Prevent recursive calls
        if (this.processingExternalChange) {
            log(`[StateSyncService] ⚠️  Already processing external change, ignoring recursive call`);
            return;
        }

        this.processingExternalChange = true;
        
        try {
            // Capture the current lastKnownVersion BEFORE reading (which may update it)
            const versionBeforeRead = this.lastKnownVersion;
            
            log(`[StateSyncService] Reading state file...`);
            const state = this.readState();
            
            if (!state) {
                log(`[StateSyncService] ⚠️  No state found after read, aborting`);
                this.processingExternalChange = false;
                return;
            }

            log(`[StateSyncService] State read successfully:`);
            log(`  - Version: ${state.version}`);
            log(`  - Source: ${state.source}`);
            log(`  - Timestamp: ${new Date(state.timestamp).toISOString()}`);
            log(`  - Current layer: ${state.currentLayer}`);
            log(`  - Node counts: ${JSON.stringify(
                Object.entries(state.graphs).reduce((acc, [layer, graph]) => {
                    acc[layer] = graph.nodes?.length || 0;
                    return acc;
                }, {} as Record<string, number>)
            )}`);

            // Check if this is a new version using the version BEFORE readState() updated lastKnownVersion
            // This prevents the bug where readState() updates lastKnownVersion before we check
            if (state.version <= versionBeforeRead) {
                log(`[StateSyncService] ⚠️  State version ${state.version} is not newer than last known ${versionBeforeRead}, ignoring`);
                // Restore lastKnownVersion to what it was before readState() updated it
                this.lastKnownVersion = versionBeforeRead;
                // Update lastProcessedVersion to prevent polling loop
                // If we've already seen this version, mark it as processed to stop polling from retrying
                if (state.version > this.lastProcessedVersion) {
                    this.lastProcessedVersion = state.version;
                    log(`[StateSyncService] Updated lastProcessedVersion to ${state.version} to prevent polling loop`);
                }
                this.processingExternalChange = false;
                return;
            }

            // Check if we already processed this version
            if (state.version === this.lastProcessedVersion) {
                log(`[StateSyncService] ⚠️  State version ${state.version} already processed, ignoring duplicate`);
                this.processingExternalChange = false;
                return;
            }

            log(`[StateSyncService] ✓ New state version detected (${state.version} > ${versionBeforeRead})`);
            // Note: lastKnownVersion was already updated by readState(), but we ensure it's correct here
            this.lastKnownVersion = state.version;
            this.lastProcessedVersion = state.version;
            
            log(`[StateSyncService] Firing onStateChanged event...`);
            const beforeFire = Date.now();
            this.onStateChangedEmitter.fire(state);
            const afterFire = Date.now();
            log(`[StateSyncService] ✓ Event fired (took ${afterFire - beforeFire}ms)`);
            
            // Reset flag immediately after firing event to allow processing subsequent changes
            // The writeState methods already check processingExternalChange to prevent feedback loops
            this.processingExternalChange = false;
            log(`[StateSyncService] Reset processingExternalChange flag (immediately after event)`);
            
            const totalTime = Date.now() - startTime;
            log(`[StateSyncService] ========== handleExternalChange END (${totalTime}ms) ==========`);
        } catch (error) {
            log(`[StateSyncService] ❌ ERROR handling external change: ${error}`);
            if (error instanceof Error) {
                log(`[StateSyncService] Error stack: ${error.stack}`);
            }
            // Reset flag on error too
            this.processingExternalChange = false;
            log(`[StateSyncService] Reset processingExternalChange flag (on error)`);
        }
    }

    /**
     * Read the current state from file
     */
    public readState(): SharedGraphState | null {
        const stateFile = getSharedStateFile();
        log(`[StateSyncService] Reading state from: ${stateFile}`);
        
        try {
            if (!fs.existsSync(stateFile)) {
                log('[StateSyncService] ⚠️  State file does not exist, creating empty state');
                const emptyState = createEmptySharedState();
                // Don't write during read if we're processing external change to avoid loop
                if (!this.processingExternalChange) {
                    this.writeStateInternal(emptyState);
                }
                return emptyState;
            }

            log(`[StateSyncService] Reading file content...`);
            const fileContent = fs.readFileSync(stateFile, 'utf-8');
            log(`[StateSyncService] File size: ${fileContent.length} bytes`);
            
            const state = JSON.parse(fileContent) as SharedGraphState;
            log(`[StateSyncService] ✓ Successfully parsed state (version ${state.version})`);
            
            // Update last known version (but don't update lastProcessedVersion here)
            if (state.version > this.lastKnownVersion) {
                this.lastKnownVersion = state.version;
            }
            
            return state;
        } catch (error) {
            log(`[StateSyncService] ❌ Error reading state file: ${error}`);
            if (error instanceof Error) {
                log(`[StateSyncService] Error message: ${error.message}`);
                log(`[StateSyncService] Error stack: ${error.stack}`);
            }
            return null;
        }
    }

    /**
     * Write state to file (debounced to avoid excessive writes)
     */
    public writeState(state: Partial<SharedGraphState>): void {
        log(`[StateSyncService] writeState called (debounced)`);
        log(`  - processingExternalChange: ${this.processingExternalChange}`);
        log(`  - isWriting: ${this.isWriting}`);
        
        // Don't write if we're processing an external change to prevent feedback loop
        if (this.processingExternalChange) {
            log(`[StateSyncService] ⚠️  Skipping write - currently processing external change (preventing feedback loop)`);
            return;
        }

        // Clear any pending write
        if (this.writeDebounceTimer) {
            log(`[StateSyncService] Clearing pending debounced write`);
            clearTimeout(this.writeDebounceTimer);
        }

        // Debounce writes by 100ms
        log(`[StateSyncService] Scheduling debounced write (100ms delay)...`);
        this.writeDebounceTimer = setTimeout(() => {
            this.writeStateImmediate(state);
        }, 100);
    }

    /**
     * Write state immediately without debouncing
     */
    public writeStateImmediate(state: Partial<SharedGraphState>): void {
        this.writeCount++;
        const startTime = Date.now();
        log(`[StateSyncService] ========== writeStateImmediate START [${this.writeCount}] ==========`);
        log(`  - Timestamp: ${new Date().toISOString()}`);
        log(`  - processingExternalChange: ${this.processingExternalChange}`);
        log(`  - isWriting: ${this.isWriting}`);
        log(`  - Current version: ${this.lastKnownVersion}`);
        log(`  - State keys to merge: ${Object.keys(state).join(', ')}`);
        
        // Don't write if we're processing an external change to prevent feedback loop
        if (this.processingExternalChange) {
            log(`[StateSyncService] ⚠️  ABORTING write - currently processing external change (preventing feedback loop)`);
            return;
        }

        try {
            log(`[StateSyncService] Reading current state for merge...`);
            const currentState = this.readState() || createEmptySharedState();
            log(`[StateSyncService] Current state version: ${currentState.version}`);

            // Merge with new state
            const mergedState: SharedGraphState = {
                ...currentState,
                ...state,
                version: currentState.version + 1, // Increment version
                timestamp: Date.now(),
                source: 'vscode-extension'
            };

            log(`[StateSyncService] Merged state created:`);
            log(`  - New version: ${mergedState.version}`);
            log(`  - Source: ${mergedState.source}`);
            log(`  - Timestamp: ${new Date(mergedState.timestamp).toISOString()}`);
            log(`  - Current layer: ${mergedState.currentLayer}`);
            log(`  - Graphs: ${Object.keys(mergedState.graphs).join(', ')}`);

            this.writeStateInternal(mergedState);
            this.lastKnownVersion = mergedState.version;

            const totalTime = Date.now() - startTime;
            log(`[StateSyncService] ✓ Wrote state version ${mergedState.version} (took ${totalTime}ms)`);
            log(`[StateSyncService] ========== writeStateImmediate END [${this.writeCount}] ==========`);
        } catch (error) {
            log(`[StateSyncService] ❌ ERROR writing state: ${error}`);
            if (error instanceof Error) {
                log(`[StateSyncService] Error message: ${error.message}`);
                log(`[StateSyncService] Error stack: ${error.stack}`);
            }
        }
    }

    /**
     * Internal write method (sets isWriting flag to prevent feedback loop)
     */
    private writeStateInternal(state: SharedGraphState): void {
        const stateFile = getSharedStateFile();
        log(`[StateSyncService] writeStateInternal: Writing to ${stateFile}`);
        log(`  - Version: ${state.version}`);
        log(`  - Setting isWriting flag to true`);
        
        try {
            this.isWriting = true;
            
            // Write to temp file first, then rename (atomic operation)
            const tempFile = stateFile + '.tmp';
            log(`[StateSyncService] Writing to temp file: ${tempFile}`);
            
            const jsonContent = JSON.stringify(state, null, 2);
            log(`[StateSyncService] JSON size: ${jsonContent.length} bytes`);
            
            fs.writeFileSync(tempFile, jsonContent, 'utf-8');
            log(`[StateSyncService] ✓ Temp file written`);
            
            fs.renameSync(tempFile, stateFile);
            log(`[StateSyncService] ✓ File renamed (atomic operation complete)`);
            
            // Give file system more time to settle and for watchers to process
            // Increased from 50ms to 300ms to prevent feedback loops
            setTimeout(() => {
                this.isWriting = false;
                log(`[StateSyncService] Reset isWriting flag (300ms after write)`);
            }, 300);
        } catch (error) {
            this.isWriting = false;
            log(`[StateSyncService] ❌ ERROR in writeStateInternal: ${error}`);
            if (error instanceof Error) {
                log(`[StateSyncService] Error message: ${error.message}`);
                log(`[StateSyncService] Error stack: ${error.stack}`);
            }
            throw error;
        }
    }

    /**
     * Get the state file path (for debugging)
     */
    public getStateFilePath(): string {
        return getSharedStateFile();
    }

    /**
     * Get the state directory path (for debugging)
     */
    public getStateDirPath(): string {
        return getSharedStateDir();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopWatching();
        this.stopPolling();
        this.onStateChangedEmitter.dispose();
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }
        if (this.fileChangeDebounceTimer) {
            clearTimeout(this.fileChangeDebounceTimer);
        }
    }
}


