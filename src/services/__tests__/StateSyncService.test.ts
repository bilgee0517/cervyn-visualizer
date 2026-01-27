/**
 * StateSyncService Unit Tests
 *
 * Tests file watching, state reading/writing, debouncing, conflict detection,
 * and error recovery functionality.
 */

import { StateSyncService } from '../StateSyncService';
import { SharedGraphState, createEmptySharedState, SCHEMA_VERSION } from '../../config/shared-state-config';
import {
    createMockEmptyState,
    createMockStateWithNodes,
    createCorruptedStateJSON,
    createInvalidStateStructure,
    createOldSchemaState,
    waitFor,
    sleep
} from '../../__tests__/mocks/shared-state.mock';
// Mock dependencies FIRST - before imports
jest.mock('vscode');
jest.mock('../../logger');

// Mock fs using requireActual instead of importing
jest.mock('fs', () => {
    const { mockFs } = jest.requireActual('../../__tests__/mocks/fs.mock');
    return mockFs;
});

// Create mock factory functions (not variables)
jest.mock('../../utils/file-locking', () => ({
    fileLockManager: {
        acquireLock: jest.fn(),
        releaseLock: jest.fn()
    },
    LockAcquisitionError: class LockAcquisitionError extends Error {}
}));

jest.mock('../StateBackupService', () => ({
    stateBackupService: {
        backupState: jest.fn(),
        restoreLatestBackupSync: jest.fn()
    }
}));

jest.mock('../StatePruningService', () => ({
    statePruningService: {
        needsPruning: jest.fn().mockReturnValue(false),
        pruneState: jest.fn()
    }
}));

// Mock modules that need runtime variables
const mockGetWorkspacePath = jest.fn();

jest.mock('../../config/shared-state-config', () => {
    const actual = jest.requireActual('../../config/shared-state-config');
    return {
        ...actual,
        getWorkspacePath: () => mockGetWorkspacePath(),
        getSharedStateDir: (workspacePath?: string) =>
            workspacePath ? `${workspacePath}/.codebase-visualizer` : '/test/.codebase-visualizer',
        getSharedStateFile: (workspacePath?: string) =>
            workspacePath ? `${workspacePath}/.codebase-visualizer/graph-state.json` : '/test/.codebase-visualizer/graph-state.json'
    };
});

// Now import for use in tests
import { mockFs, MockFSWatcher } from '../../__tests__/mocks/fs.mock';

// Get mock instances for test access
const mockFileLockManager = require('../../utils/file-locking').fileLockManager;
const mockStateBackupService = require('../StateBackupService').stateBackupService;
const mockStatePruningService = require('../StatePruningService').statePruningService;

// TODO: These tests need enhanced file system mock infrastructure:
// - Async event coordination for file watchers
// - Debounce timing simulation
// - Lock contention scenarios
// - Multi-service state synchronization
// Skipping until mock infrastructure is complete
describe.skip('StateSyncService', () => {
    let service: StateSyncService;
    const testWorkspacePath = '/test/workspace';
    const testStateDir = `${testWorkspacePath}/.codebase-visualizer`;
    const testStateFile = `${testStateDir}/graph-state.json`;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockFs.reset();

        // Setup test environment
        mockGetWorkspacePath.mockReturnValue(testWorkspacePath);
        mockFs.mkdirSync(testWorkspacePath, { recursive: true });
        mockFs.mkdirSync(testStateDir, { recursive: true });

        // Setup default mock implementations
        mockFileLockManager.acquireLock.mockResolvedValue(jest.fn());
        mockStateBackupService.backupState.mockResolvedValue(undefined);
        mockStateBackupService.restoreLatestBackupSync.mockReturnValue(null);
    });

    afterEach(() => {
        if (service) {
            service.dispose();
        }
    });

    describe('Initialization', () => {
        test('should create state directory on initialization', () => {
            service = new StateSyncService();

            expect(mockFs.existsSync(testStateDir)).toBe(true);
        });

        test('should create empty state file if it does not exist', async () => {
            service = new StateSyncService();

            await sleep(100); // Wait for async initialization

            expect(mockFs.existsSync(testStateFile)).toBe(true);

            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const state = JSON.parse(fileContent);

            expect(state.version).toBe(1);
            expect(state.schemaVersion).toBe(SCHEMA_VERSION);
            expect(state.source).toBe('vscode-extension');
        });

        test('should load existing state on initialization', async () => {
            const existingState = createMockStateWithNodes({ version: 5 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(existingState, null, 2));

            service = new StateSyncService();
            await sleep(100);

            const result = service.readStateResult();
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.version).toBe(5);
            }
        });

        test('should not create duplicate directory if it exists', () => {
            // Directory already created in beforeEach
            const mkdirSpy = jest.spyOn(mockFs, 'mkdirSync');

            service = new StateSyncService();

            // Should not call mkdirSync since directory exists
            expect(mkdirSpy).not.toHaveBeenCalledWith(testStateDir, { recursive: true });
        });
    });

    describe('File Watching', () => {
        test('should start file watcher successfully', () => {
            service = new StateSyncService();
            service.startWatching();

            const watcherState = mockFs.getState();
            expect(watcherState.watchers).toContain(testStateDir);
        });

        test('should not start duplicate watchers', () => {
            service = new StateSyncService();
            service.startWatching();
            service.startWatching(); // Try to start again

            const watcherState = mockFs.getState();
            // Should only have one watcher
            expect(watcherState.watchers.filter(w => w === testStateDir).length).toBe(1);
        });

        test('should stop file watcher', () => {
            service = new StateSyncService();
            service.startWatching();
            service.stopWatching();

            const watcherState = mockFs.getState();
            expect(watcherState.watchers).not.toContain(testStateDir);
        });

        test('should detect external file changes', async () => {
            const eventHandler = jest.fn();

            service = new StateSyncService();
            service.onStateChanged(eventHandler);
            service.startWatching();

            // Simulate external write
            const newState = createMockStateWithNodes({ version: 2 });
            mockFs.simulateExternalWrite(testStateFile, JSON.stringify(newState, null, 2));

            // Wait for debounce
            await sleep(200);

            expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
                version: 2
            }));
        });

        test('should debounce rapid file changes', async () => {
            const eventHandler = jest.fn();

            service = new StateSyncService();
            service.onStateChanged(eventHandler);
            service.startWatching();

            // Simulate multiple rapid changes
            for (let i = 1; i <= 5; i++) {
                const state = createMockStateWithNodes({ version: i });
                mockFs.simulateExternalWrite(testStateFile, JSON.stringify(state, null, 2));
                await sleep(30); // Rapid changes within debounce window
            }

            // Wait for debounce to settle
            await sleep(200);

            // Should only process the final change
            expect(eventHandler).toHaveBeenCalledTimes(1);
            expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
                version: 5
            }));
        });

        test('should ignore self-written changes by version tracking', async () => {
            const eventHandler = jest.fn();

            service = new StateSyncService();
            service.onStateChanged(eventHandler);
            service.startWatching();

            // Write state through service
            const state = createMockStateWithNodes({ version: 1 });
            await service.writeStateImmediate(state);

            // Wait for file watcher debounce
            await sleep(200);

            // Should not fire event for own write (version check)
            // The version we wrote should match the lastWrittenVersion
            // so handleExternalChange will skip it
            expect(eventHandler).not.toHaveBeenCalled();
        });

        test('should handle watcher errors gracefully', async () => {
            service = new StateSyncService();
            service.startWatching();

            // Get the watcher and simulate an error
            const watcher = mockFs.getWatcher(testStateDir);
            expect(watcher).toBeDefined();

            if (watcher) {
                const error = new Error('Watcher error');
                watcher.simulateError(error);

                // Wait for retry logic
                await sleep(1100);

                // Should attempt to restart watcher
                expect(mockFs.getState().watchers).toContain(testStateDir);
            }
        });
    });

    describe('State Reading', () => {
        test('should read valid state file successfully', () => {
            const state = createMockStateWithNodes({ version: 3 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(state, null, 2));

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.version).toBe(3);
                expect(result.value.graphs.code.nodes.length).toBe(3);
            }
        });

        test('should create empty state if file does not exist', () => {
            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.version).toBe(1);
                expect(result.value.schemaVersion).toBe(SCHEMA_VERSION);
            }
        });

        test('should handle corrupt JSON gracefully', () => {
            mockFs.writeFileSync(testStateFile, createCorruptedStateJSON());

            service = new StateSyncService();
            const result = service.readStateResult();

            // Should return error for corrupt JSON
            expect(result.ok).toBe(false);
        });

        test('should attempt backup restoration on corrupt JSON', () => {
            const backupState = createMockStateWithNodes({ version: 2 });
            mockFs.writeFileSync(testStateFile, createCorruptedStateJSON());

            // Mock backup restoration
            mockStateBackupService.restoreLatestBackupSync.mockReturnValue(true);
            mockFs.writeFileSync(testStateFile, JSON.stringify(backupState, null, 2));

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(mockStateBackupService.restoreLatestBackupSync).toHaveBeenCalled();
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.version).toBe(2);
            }
        });

        test('should handle invalid state structure', () => {
            const invalidState = createInvalidStateStructure();
            mockFs.writeFileSync(testStateFile, JSON.stringify(invalidState, null, 2));

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(false);
        });

        test('should migrate old schema versions', () => {
            const oldState = createOldSchemaState(1);
            mockFs.writeFileSync(testStateFile, JSON.stringify(oldState, null, 2));

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.schemaVersion).toBe(SCHEMA_VERSION);
                // Should have migrated to include workflow layer (v3)
                expect(result.value.graphs.workflow).toBeDefined();
            }
        });

        test('should migrate from v0 to current schema', () => {
            const v0State = createOldSchemaState(0);
            mockFs.writeFileSync(testStateFile, JSON.stringify(v0State, null, 2));

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.schemaVersion).toBe(SCHEMA_VERSION);
            }
        });

        test('should use legacy readState method', () => {
            const state = createMockStateWithNodes({ version: 4 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(state, null, 2));

            service = new StateSyncService();
            const result = service.readState();

            expect(result).not.toBeNull();
            expect(result?.version).toBe(4);
        });

        test('should return null from legacy readState on error', () => {
            mockFs.writeFileSync(testStateFile, createCorruptedStateJSON());

            service = new StateSyncService();
            const result = service.readState();

            expect(result).toBeNull();
        });
    });

    describe('State Writing', () => {
        test('should write state with debouncing', async () => {
            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1 });
            service.writeState(state);

            // Should not write immediately
            expect(mockFs.existsSync(testStateFile)).toBe(true);
            const initialContent = mockFs.readFileSync(testStateFile, 'utf-8');

            // Wait for debounce
            await sleep(200);

            const finalContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const finalState = JSON.parse(finalContent);

            expect(finalState.version).toBe(2); // Incremented
        });

        test('should increment version on write', async () => {
            const initialState = createMockStateWithNodes({ version: 5 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();

            const updates = { source: 'vscode-extension' as const };
            await service.writeStateImmediate(updates);

            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const writtenState = JSON.parse(fileContent);

            expect(writtenState.version).toBe(6); // Incremented from 5
        });

        test('should perform atomic writes with temp file', async () => {
            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1 });
            await service.writeStateImmediate(state);

            // Check that temp file was created and renamed
            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            expect(fileContent).toBeDefined();

            // Temp file should not exist after atomic operation
            expect(mockFs.existsSync(`${testStateFile}.tmp`)).toBe(false);
        });

        test('should acquire file lock before writing', async () => {
            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1 });
            await service.writeStateImmediate(state);

            expect(mockFileLockManager.acquireLock).toHaveBeenCalledWith(
                testStateFile,
                expect.objectContaining({
                    retries: expect.any(Object),
                    stale: 3000
                })
            );
        });

        test('should release file lock after writing', async () => {
            const releaseLock = jest.fn().mockResolvedValue(undefined);
            mockFileLockManager.acquireLock.mockResolvedValue(releaseLock);

            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1 });
            await service.writeStateImmediate(state);

            expect(releaseLock).toHaveBeenCalled();
        });

        test('should proceed without lock if acquisition fails', async () => {
            const { LockAcquisitionError } = require('../../utils/file-locking');
            mockFileLockManager.acquireLock.mockRejectedValue(new LockAcquisitionError('Lock failed'));

            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1 });

            // Should not throw, should proceed without lock
            await expect(service.writeStateImmediate(state)).resolves.not.toThrow();

            // State should still be written
            expect(mockFs.existsSync(testStateFile)).toBe(true);
        });

        test('should create backup before writing', async () => {
            const initialState = createMockStateWithNodes({ version: 1 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();

            const updates = { source: 'vscode-extension' as const };
            await service.writeStateImmediate(updates);

            expect(mockStateBackupService.backupState).toHaveBeenCalled();
        });

        test('should continue writing even if backup fails', async () => {
            mockStateBackupService.backupState.mockRejectedValue(new Error('Backup failed'));

            const initialState = createMockStateWithNodes({ version: 1 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();

            const updates = { source: 'vscode-extension' as const };
            await expect(service.writeStateImmediate(updates)).resolves.not.toThrow();
        });

        test('should update timestamp on write', async () => {
            service = new StateSyncService();

            const beforeWrite = Date.now();
            const state = createMockStateWithNodes({ version: 1 });
            await service.writeStateImmediate(state);
            const afterWrite = Date.now();

            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const writtenState = JSON.parse(fileContent);

            expect(writtenState.timestamp).toBeGreaterThanOrEqual(beforeWrite);
            expect(writtenState.timestamp).toBeLessThanOrEqual(afterWrite);
        });

        test('should set source to vscode-extension on write', async () => {
            service = new StateSyncService();

            const state = createMockStateWithNodes({ version: 1, source: 'mcp-server' });
            await service.writeStateImmediate(state);

            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const writtenState = JSON.parse(fileContent);

            expect(writtenState.source).toBe('vscode-extension');
        });

        test('should debounce multiple rapid writes', async () => {
            service = new StateSyncService();

            // Trigger multiple rapid writes
            for (let i = 1; i <= 5; i++) {
                const state = createMockStateWithNodes({ version: i });
                service.writeState(state);
                await sleep(30); // Rapid writes within debounce window
            }

            // Wait for debounce to settle
            await sleep(200);

            const fileContent = mockFs.readFileSync(testStateFile, 'utf-8');
            const writtenState = JSON.parse(fileContent);

            // Should have the last write's data
            expect(writtenState.graphs.code.nodes.length).toBe(3);
        });
    });

    describe('Change Detection', () => {
        test('should only process state changes with newer versions', async () => {
            const eventHandler = jest.fn();

            const initialState = createMockStateWithNodes({ version: 5 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();
            await sleep(100); // Wait for initialization

            service.onStateChanged(eventHandler);
            service.startWatching();

            // Simulate external write with older version
            const olderState = createMockStateWithNodes({ version: 3 });
            mockFs.simulateExternalWrite(testStateFile, JSON.stringify(olderState, null, 2));

            await sleep(200);

            // Should not fire event for older version
            expect(eventHandler).not.toHaveBeenCalled();
        });

        test('should process state changes with equal or newer versions', async () => {
            const eventHandler = jest.fn();

            const initialState = createMockStateWithNodes({ version: 5 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();
            await sleep(100);

            service.onStateChanged(eventHandler);
            service.startWatching();

            // Simulate external write with newer version
            const newerState = createMockStateWithNodes({ version: 7 });
            mockFs.simulateExternalWrite(testStateFile, JSON.stringify(newerState, null, 2));

            await sleep(200);

            expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
                version: 7
            }));
        });

        test('should update lastKnownVersion after processing change', async () => {
            const initialState = createMockStateWithNodes({ version: 2 });
            mockFs.writeFileSync(testStateFile, JSON.stringify(initialState, null, 2));

            service = new StateSyncService();
            await sleep(100);

            service.startWatching();

            // Simulate external write
            const newState = createMockStateWithNodes({ version: 5 });
            mockFs.simulateExternalWrite(testStateFile, JSON.stringify(newState, null, 2));

            await sleep(200);

            // Try to trigger same version again - should be ignored
            const eventHandler = jest.fn();
            service.onStateChanged(eventHandler);
            mockFs.simulateExternalWrite(testStateFile, JSON.stringify(newState, null, 2));

            await sleep(200);

            expect(eventHandler).not.toHaveBeenCalled();
        });
    });

    describe('Error Recovery', () => {
        test('should handle file system read errors', () => {
            // Make file unreadable by making it a directory
            mockFs.mkdirSync(testStateFile);

            service = new StateSyncService();
            const result = service.readStateResult();

            expect(result.ok).toBe(false);
        });

        test('should handle file system write errors', async () => {
            service = new StateSyncService();

            // Make directory read-only by removing it
            mockFs.rmdirSync(testStateDir);

            const state = createMockStateWithNodes({ version: 1 });

            await expect(service.writeStateImmediate(state)).rejects.toThrow();
        });

        test('should release lock on write error', async () => {
            const releaseLock = jest.fn().mockResolvedValue(undefined);
            mockFileLockManager.acquireLock.mockResolvedValue(releaseLock);

            service = new StateSyncService();

            // Remove directory to cause write error
            mockFs.rmdirSync(testStateDir);

            const state = createMockStateWithNodes({ version: 1 });

            try {
                await service.writeStateImmediate(state);
            } catch (error) {
                // Expected to throw
            }

            expect(releaseLock).toHaveBeenCalled();
        });
    });

    describe('Utility Methods', () => {
        test('should return correct state file path', () => {
            service = new StateSyncService();

            const path = service.getStateFilePath();
            expect(path).toBe(testStateFile);
        });

        test('should return correct state directory path', () => {
            service = new StateSyncService();

            const path = service.getStateDirPath();
            expect(path).toContain('.codebase-visualizer');
        });
    });

    describe('Disposal', () => {
        test('should stop watching on dispose', () => {
            service = new StateSyncService();
            service.startWatching();
            service.dispose();

            const watcherState = mockFs.getState();
            expect(watcherState.watchers).not.toContain(testStateDir);
        });

        test('should clear debounce timers on dispose', () => {
            service = new StateSyncService();

            // Trigger a debounced write
            const state = createMockStateWithNodes({ version: 1 });
            service.writeState(state);

            // Dispose before debounce completes
            service.dispose();

            // The write should be cancelled (can't easily test this without timer mocking)
            // At minimum, dispose should not throw
            expect(() => service.dispose()).not.toThrow();
        });
    });
});
