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
    createEmptySharedState,
    SCHEMA_VERSION,
    migrateStateSchema
} from '../config/shared-state-config';
import { log, error as logError } from '../logger';
import { 
    FileSystemError, 
    ParsingError, 
    GraphStateError 
} from '../errors';
import { Result, Ok, Err } from '../types/result';
import { 
    handleError, 
    generateCorrelationId 
} from '../utils/error-handler';
import { fileLockManager, LockAcquisitionError } from '../utils/file-locking';
import { stateBackupService } from './StateBackupService';
import { statePruningService } from './StatePruningService';

export class StateSyncService {
    private fileWatcher?: fs.FSWatcher;
    private lastKnownVersion: number = 0;
    private onStateChangedEmitter = new vscode.EventEmitter<SharedGraphState>();
    public readonly onStateChanged = this.onStateChangedEmitter.event;
    
    private isWriting: boolean = false; // Prevent feedback loops
    private writeDebounceTimer?: NodeJS.Timeout;
    private fileChangeDebounceTimer?: NodeJS.Timeout; // Debounce file watcher events
    private readonly DEBOUNCE_MS = 150; // Single debounce for all operations

    constructor() {
        log(`[StateSyncService] Constructor called`);
        this.ensureStateDirectory();
        // Initialize state file asynchronously
        this.initializeStateFile().catch(err => {
            log(`[StateSyncService] Error during initialization: ${err instanceof Error ? err.message : String(err)}`);
        });
        log(`[StateSyncService] Initialized. State file: ${getSharedStateFile()}`);
    }

    /**
     * Ensure the shared state directory exists
     */
    private ensureStateDirectory(): void {
        const stateDir = getSharedStateDir();
        log(`[StateSyncService] Ensuring state directory exists: ${stateDir}`);
        
        try {
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
                log(`[StateSyncService] ✓ Created state directory: ${stateDir}`);
            } else {
                log(`[StateSyncService] ✓ State directory already exists: ${stateDir}`);
            }
        } catch (err) {
            const error = new FileSystemError(
                `Failed to create state directory: ${stateDir}`,
                stateDir,
                'write',
                { operation: 'ensureStateDirectory' },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'ensureStateDirectory',
                component: 'StateSyncService',
                correlationId: generateCorrelationId()
            }, true);
            throw error;
        }
    }

    /**
     * Initialize the state file if it doesn't exist
     */
    private async initializeStateFile(): Promise<void> {
        const stateFile = getSharedStateFile();
        log(`[StateSyncService] Checking state file: ${stateFile}`);
        
        try {
            if (!fs.existsSync(stateFile)) {
                log(`[StateSyncService] State file does not exist, creating empty state...`);
                const emptyState = createEmptySharedState();
                await this.writeStateInternal(emptyState);
                this.lastKnownVersion = emptyState.version;
                log(`[StateSyncService] ✓ Initialized state file: ${stateFile} (version ${emptyState.version})`);
            } else {
                // Load existing state to get current version
                const result = this.readStateResult();
                if (result.ok) {
                    this.lastKnownVersion = result.value.version;
                    log(`[StateSyncService] ✓ State file exists, loaded version ${result.value.version}`);
                } else {
                    handleError(result.error, {
                        operation: 'initializeStateFile - read existing',
                        component: 'StateSyncService'
                    });
                }
            }
        } catch (err) {
            const error = new FileSystemError(
                `Failed to initialize state file: ${stateFile}`,
                stateFile,
                'write',
                { operation: 'initializeStateFile' },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'initializeStateFile',
                component: 'StateSyncService'
            }, true);
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

        // Use Node.js fs.watch() for reliable file watching outside workspace
        try {
            this.fileWatcher = fs.watch(stateFile, (eventType) => {
                log(`[StateSyncService] File change detected (${eventType})`);
                
                // Handle 'rename' events (file created, deleted, or renamed)
                if (eventType === 'rename' && !fs.existsSync(stateFile)) {
                    log('[StateSyncService] File was deleted, will recreate on next access');
                    return;
                }
                
                // Clear existing debounce timer
                if (this.fileChangeDebounceTimer) {
                    clearTimeout(this.fileChangeDebounceTimer);
                }
                
                // Debounce: wait after last change before processing
                this.fileChangeDebounceTimer = setTimeout(() => {
                    this.fileChangeDebounceTimer = undefined;
                    
                    // Verify file still exists
                    if (!fs.existsSync(stateFile)) {
                        return;
                    }
                    
                    // Only ignore if we're currently writing (prevents feedback loop)
                    if (!this.isWriting) {
                        log('[StateSyncService] Processing external change');
                        this.handleExternalChange();
                    } else {
                        log('[StateSyncService] Ignoring change - currently writing');
                    }
                }, this.DEBOUNCE_MS);
            });

            // Handle watcher errors (e.g., file deleted while watching)
            this.fileWatcher.on('error', (err) => {
                const error = new FileSystemError(
                    'File watcher error occurred',
                    stateFile,
                    'watch',
                    { operation: 'file watching' },
                    err instanceof Error ? err : undefined
                );
                
                handleError(error, {
                    operation: 'file watcher',
                    component: 'StateSyncService',
                    metadata: { willRetry: true }
                });
                
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
        } catch (err) {
            const error = new FileSystemError(
                `Failed to start file watcher for: ${stateFile}`,
                stateFile,
                'watch',
                { operation: 'startWatching' },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'startWatching',
                component: 'StateSyncService'
            }, true);
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
    }

    /**
     * Handle external changes to the state file
     * Simplified: just read and fire event, let GraphService handle merging
     */
    private handleExternalChange(): void {
        log(`[StateSyncService] Reading external change`);
        
        const correlationId = generateCorrelationId();
        const result = this.readStateResult();
        
        if (!result.ok) {
            handleError(result.error, {
                operation: 'handleExternalChange',
                component: 'StateSyncService',
                correlationId
            });
            return;
        }
        
        const state = result.value;

        // Simple version check - only process if newer
        if (state.version <= this.lastKnownVersion) {
            return;
        }

        log(`[StateSyncService] New state version: ${state.version} (from ${state.source})`, () => ({
            correlationId,
            oldVersion: this.lastKnownVersion,
            newVersion: state.version,
            source: state.source
        }));
        
        this.lastKnownVersion = state.version;
        
        // Fire event - GraphService will handle smart merging
        this.onStateChangedEmitter.fire(state);
    }

    /**
     * Read the current state from file (with Result type)
     */
    public readStateResult(): Result<SharedGraphState, FileSystemError | ParsingError | GraphStateError> {
        const stateFile = getSharedStateFile();
        const correlationId = generateCorrelationId();
        
        log(`[StateSyncService] Reading state from: ${stateFile}`, () => ({ correlationId }));
        
        try {
            if (!fs.existsSync(stateFile)) {
                log('[StateSyncService] State file does not exist, creating empty state');
                const emptyState = createEmptySharedState();
                // Note: Using sync write here to avoid async in readStateResult
                // The lock will be attempted but won't block if it fails
                const tempFile = stateFile + '.tmp';
                fs.writeFileSync(tempFile, JSON.stringify(emptyState, null, 2), 'utf-8');
                fs.renameSync(tempFile, stateFile);
                return Ok(emptyState);
            }

            log(`[StateSyncService] Reading file content...`);
            const fileContent = fs.readFileSync(stateFile, 'utf-8');
            log(`[StateSyncService] File size: ${fileContent.length} bytes`, () => ({ 
                correlationId,
                fileSize: fileContent.length 
            }));
            
            // Parse JSON
            let state: any;
            try {
                state = JSON.parse(fileContent);
            } catch (err) {
                const parseError = new ParsingError(
                    'Failed to parse state file as JSON',
                    stateFile,
                    undefined,
                    undefined,
                    { correlationId, fileSize: fileContent.length },
                    err instanceof Error ? err : undefined
                );
                // Attempt to restore from backup
                const restoredState = this.attemptBackupRestoration(correlationId);
                if (restoredState) {
                    log(`[StateSyncService] ✓ Restored state from backup after parse error`, () => ({ correlationId }));
                    return Ok(restoredState);
                }
                return Err(parseError);
            }
            
            // Validate structure
            if (!state.graphs || typeof state.graphs !== 'object') {
                const validationError = new GraphStateError(
                    'Invalid state structure: missing or invalid graphs field',
                    'validate',
                    { correlationId, hasGraphs: !!state.graphs }
                );
                // Attempt to restore from backup
                const restoredState = this.attemptBackupRestoration(correlationId);
                if (restoredState) {
                    log(`[StateSyncService] ✓ Restored state from backup after validation error`, () => ({ correlationId }));
                    return Ok(restoredState);
                }
                return Err(validationError);
            }
            
            if (typeof state.version !== 'number') {
                const validationError = new GraphStateError(
                    'Invalid state structure: missing or invalid version field',
                    'validate',
                    { correlationId, hasVersion: !!state.version, versionType: typeof state.version }
                );
                // Attempt to restore from backup
                const restoredState = this.attemptBackupRestoration(correlationId);
                if (restoredState) {
                    log(`[StateSyncService] ✓ Restored state from backup after validation error`, () => ({ correlationId }));
                    return Ok(restoredState);
                }
                return Err(validationError);
            }
            
            log(`[StateSyncService] ✓ Successfully parsed state (version ${state.version})`, () => ({
                correlationId,
                version: state.version
            }));
            
            // Apply schema migrations if needed
            const currentSchemaVersion = state.schemaVersion || 0;
            if (currentSchemaVersion < SCHEMA_VERSION) {
                log(`[StateSyncService] State needs schema migration (current: ${currentSchemaVersion}, target: ${SCHEMA_VERSION})`, () => ({ correlationId }));
                state = migrateStateSchema(state);
                
                // Write migrated state back to file
                try {
                    const tempFile = stateFile + '.tmp';
                    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
                    fs.renameSync(tempFile, stateFile);
                    log(`[StateSyncService] ✓ Migrated state written to file`, () => ({ correlationId }));
                } catch (err) {
                    logError(`[StateSyncService] Warning: Failed to write migrated state: ${err instanceof Error ? err.message : String(err)}`, err, () => ({ correlationId }));
                    // Continue with in-memory migrated state even if write fails
                }
            }
            
            // Update last known version
            if (state.version > this.lastKnownVersion) {
                this.lastKnownVersion = state.version;
            }
            
            return Ok(state as SharedGraphState);
        } catch (err) {
            const fsError = new FileSystemError(
                `Failed to read state file: ${stateFile}`,
                stateFile,
                'read',
                { correlationId },
                err instanceof Error ? err : undefined
            );
            // Attempt to restore from backup
            const restoredState = this.attemptBackupRestoration(correlationId);
            if (restoredState) {
                log(`[StateSyncService] ✓ Restored state from backup after file system error`, () => ({ correlationId }));
                return Ok(restoredState);
            }
            return Err(fsError);
        }
    }

    /**
     * Attempt to restore state from latest backup
     * Returns the restored state or null if restoration failed
     */
    private attemptBackupRestoration(correlationId: string): SharedGraphState | null {
        try {
            log(`[StateSyncService] Attempting to restore from backup...`, () => ({ correlationId }));
            
            // Try to restore latest backup (synchronously)
            const restored = stateBackupService.restoreLatestBackupSync();
            if (!restored) {
                log(`[StateSyncService] No backups available or restoration failed`, () => ({ correlationId }));
                return null;
            }
            
            // Read the restored file
            const stateFile = getSharedStateFile();
            if (!fs.existsSync(stateFile)) {
                logError(`[StateSyncService] Backup restoration failed - file still doesn't exist`, undefined, () => ({ correlationId }));
                return null;
            }
            
            const fileContent = fs.readFileSync(stateFile, 'utf-8');
            const state = JSON.parse(fileContent);
            
            // Validate the restored state
            if (!state.graphs || typeof state.graphs !== 'object' || typeof state.version !== 'number') {
                logError(`[StateSyncService] Restored backup has invalid structure`, undefined, () => ({ correlationId }));
                return null;
            }
            
            log(`[StateSyncService] ✓ Successfully restored from backup (version ${state.version})`, () => ({ correlationId }));
            return state as SharedGraphState;
        } catch (err) {
            logError(`[StateSyncService] Failed to restore from backup: ${err instanceof Error ? err.message : String(err)}`, err, () => ({ correlationId }));
            return null;
        }
    }
    
    /**
     * Read the current state from file (legacy null-returning version)
     * @deprecated Use readStateResult() for better error handling
     */
    public readState(): SharedGraphState | null {
        const result = this.readStateResult();
        if (result.ok) {
            return result.value;
        }
        handleError(result.error, {
            operation: 'readState',
            component: 'StateSyncService'
        });
        return null;
    }

    /**
     * Write state to file (debounced to avoid excessive writes)
     */
    public writeState(state: Partial<SharedGraphState>): void {
        // Clear any pending write
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }

        // Debounce writes
        this.writeDebounceTimer = setTimeout(() => {
            this.writeStateImmediate(state);
        }, this.DEBOUNCE_MS);
    }

    /**
     * Write state immediately without debouncing
     */
    public async writeStateImmediate(state: Partial<SharedGraphState>): Promise<void> {
        const correlationId = generateCorrelationId();
        
        try {
            const readResult = this.readStateResult();
            const currentState = readResult.ok ? readResult.value : createEmptySharedState();

            // Merge with new state
            const mergedState: SharedGraphState = {
                ...currentState,
                ...state,
                version: currentState.version + 1,
                timestamp: Date.now(),
                source: 'vscode-extension'
            };

            // Check if pruning is needed before writing
            let finalState = mergedState;
            if (statePruningService.needsPruning(mergedState)) {
                log(`[StateSyncService] State needs pruning, applying...`, () => ({ correlationId }));
                const { prunedState, stats } = statePruningService.pruneState(mergedState);
                finalState = prunedState;
                log(`[StateSyncService] ✓ State pruned: ${stats.historyEventsPruned} history events, ${stats.deletedNodesPruned} deleted nodes`, () => ({
                    correlationId,
                    stats
                }));
            }
            
            await this.writeStateInternal(finalState);
            this.lastKnownVersion = finalState.version;
            
            log(`[StateSyncService] Wrote state version ${finalState.version}`, () => ({
                correlationId,
                version: finalState.version
            }));
        } catch (err) {
            const error = new FileSystemError(
                'Failed to write state immediately',
                getSharedStateFile(),
                'write',
                { correlationId },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'writeStateImmediate',
                component: 'StateSyncService',
                correlationId
            }, true);
            throw error;
        }
    }

    /**
     * Internal write method (sets isWriting flag to prevent feedback loop)
     * Now includes file locking and backup before write
     */
    private async writeStateInternal(state: SharedGraphState): Promise<void> {
        const stateFile = getSharedStateFile();
        const correlationId = generateCorrelationId();
        let releaseLock: (() => Promise<void>) | null = null;
        
        try {
            this.isWriting = true;
            
            // Create backup before writing (if state file exists)
            if (fs.existsSync(stateFile)) {
                try {
                    await stateBackupService.backupState();
                } catch (backupErr) {
                    log(`[StateSyncService] ⚠️  Backup failed, continuing with write: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`);
                    // Continue with write even if backup fails
                }
            }
            
            // Acquire file lock before writing
            try {
                releaseLock = await fileLockManager.acquireLock(stateFile, {
                    retries: {
                        retries: 3,
                        minTimeout: 100,
                        maxTimeout: 500
                    },
                    stale: 3000 // 3 second stale timeout
                });
            } catch (lockErr) {
                if (lockErr instanceof LockAcquisitionError) {
                    log(`[StateSyncService] ⚠️  Failed to acquire lock, proceeding without lock (${lockErr.message})`);
                    // Proceed without lock in case of lock acquisition failure
                    // This maintains availability even if locking fails
                } else {
                    throw lockErr;
                }
            }
            
            // Write to temp file first, then rename (atomic operation)
            const tempFile = stateFile + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
            fs.renameSync(tempFile, stateFile);
            
            log(`[StateSyncService] ✓ State written successfully (version ${state.version})`);
            
            // Release lock before resetting isWriting flag
            if (releaseLock) {
                await releaseLock();
                releaseLock = null;
            }
            
            // Reset flag after file system settles
            setTimeout(() => {
                this.isWriting = false;
            }, this.DEBOUNCE_MS);
        } catch (err) {
            this.isWriting = false;
            
            // Ensure lock is released even on error
            if (releaseLock) {
                try {
                    await releaseLock();
                } catch (releaseErr) {
                    log(`[StateSyncService] ⚠️  Failed to release lock: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`);
                }
            }
            
            const error = new FileSystemError(
                `Failed to write state file: ${stateFile}`,
                stateFile,
                'write',
                { 
                    correlationId,
                    version: state.version,
                    operation: 'atomic write with locking and backup'
                },
                err instanceof Error ? err : undefined
            );
            
            handleError(error, {
                operation: 'writeStateInternal',
                component: 'StateSyncService',
                correlationId
            }, true);
            
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
        this.onStateChangedEmitter.dispose();
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }
        if (this.fileChangeDebounceTimer) {
            clearTimeout(this.fileChangeDebounceTimer);
        }
    }
}


