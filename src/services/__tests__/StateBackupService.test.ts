/**
 * StateBackupService Unit Tests
 *
 * Tests backup creation, restoration, pruning, and management functionality.
 */

// Mock dependencies FIRST
jest.mock('../../logger');
jest.mock('vscode');

// Mock fs-extra with factory function
jest.mock('fs-extra', () => ({
    ensureDirSync: jest.fn(),
    existsSync: jest.fn(),
    copy: jest.fn().mockResolvedValue(undefined),
    copyFileSync: jest.fn(),
    stat: jest.fn(),
    statSync: jest.fn(),
    readdir: jest.fn(),
    readdirSync: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../config/shared-state-config', () => ({
    getSharedStateDir: () => '/test/.codebase-visualizer',
    getSharedStateFile: () => '/test/.codebase-visualizer/graph-state.json',
    getWorkspacePath: () => '/test'
}));

// Now import for use in tests
import { StateBackupService, BackupInfo } from '../StateBackupService';
import { createMockStateWithNodes } from '../../__tests__/mocks/shared-state.mock';
import { mockFs } from '../../__tests__/mocks/fs.mock';
import * as path from 'path';

// Get mock instance for test access
const mockFsExtra = require('fs-extra');

// TODO: These tests need enhanced fs-extra mock infrastructure:
// - Async file operations (copy, remove, stat)
// - Directory traversal simulation
// - Timestamp-based backup management
// Skipping until mock infrastructure is complete
describe.skip('StateBackupService', () => {
    let service: StateBackupService;
    const backupDir = '/test/.codebase-visualizer/backups';
    const stateFile = '/test/.codebase-visualizer/graph-state.json';

    beforeEach(() => {
        jest.clearAllMocks();
        mockFs.reset();

        // Setup mock file system
        mockFs.mkdirSync('/test/.codebase-visualizer', { recursive: true });
        mockFs.mkdirSync(backupDir, { recursive: true });

        // Default mock implementations
        mockFsExtra.existsSync.mockImplementation((path: string) => mockFs.existsSync(path));
        mockFsExtra.stat.mockResolvedValue({ size: 1024 });
        mockFsExtra.statSync.mockReturnValue({ size: 1024 });
        mockFsExtra.readdir.mockResolvedValue([]);
        mockFsExtra.readdirSync.mockReturnValue([]);

        service = new StateBackupService(5);
    });

    describe('Initialization', () => {
        test('should create service with default max backups', () => {
            const defaultService = new StateBackupService();
            expect(defaultService).toBeDefined();
        });

        test('should create service with custom max backups', () => {
            const customService = new StateBackupService(10);
            expect(customService).toBeDefined();
        });

        test('should ensure backup directory exists', () => {
            expect(mockFsExtra.ensureDirSync).toHaveBeenCalledWith(backupDir);
        });

        test('should throw error if directory creation fails', () => {
            mockFsExtra.ensureDirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            expect(() => new StateBackupService()).toThrow('Permission denied');
        });
    });

    describe('Backup Creation', () => {
        test('should create backup successfully', async () => {
            mockFs.writeFileSync(stateFile, JSON.stringify(createMockStateWithNodes()));

            mockFsExtra.copy.mockResolvedValue(undefined);
            mockFsExtra.stat.mockResolvedValue({ size: 2048 });

            const backupPath = await service.backupState();

            expect(backupPath).toContain('graph-state-');
            expect(backupPath).toContain('.json');
            expect(mockFsExtra.copy).toHaveBeenCalledWith(
                stateFile,
                expect.stringContaining('graph-state-')
            );
        });

        test('should skip backup if state file does not exist', async () => {
            const backupPath = await service.backupState();

            expect(backupPath).toBe('');
            expect(mockFsExtra.copy).not.toHaveBeenCalled();
        });

        test('should use timestamp in backup filename', async () => {
            mockFs.writeFileSync(stateFile, '{}');

            const beforeBackup = new Date().toISOString();
            const backupPath = await service.backupState();
            const afterBackup = new Date().toISOString();

            const filename = path.basename(backupPath);
            expect(filename).toMatch(/^graph-state-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
        });

        test('should log backup size', async () => {
            mockFs.writeFileSync(stateFile, '{}');
            mockFsExtra.stat.mockResolvedValue({ size: 4096 });

            await service.backupState();

            expect(mockFsExtra.stat).toHaveBeenCalled();
        });

        test('should prune old backups after creation', async () => {
            mockFs.writeFileSync(stateFile, '{}');

            // Mock 6 existing backups
            const mockBackups = Array.from({ length: 6 }, (_, i) =>
                `graph-state-2024-01-${String(i + 1).padStart(2, '0')}T10-00-00-000Z.json`
            );

            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            await service.backupState();

            // Should delete the oldest backup
            expect(mockFsExtra.remove).toHaveBeenCalled();
        });

        test('should throw error if copy fails', async () => {
            mockFs.writeFileSync(stateFile, '{}');
            mockFsExtra.copy.mockRejectedValue(new Error('Copy failed'));

            await expect(service.backupState()).rejects.toThrow('Copy failed');
        });
    });

    describe('Backup Listing', () => {
        test('should list all backups', async () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json',
                'graph-state-2024-01-03T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.stat.mockResolvedValue({ size: 1024 });

            const backups = await service.listBackups();

            expect(backups.length).toBe(3);
            expect(backups[0].filename).toBe(mockBackups[2]); // Newest first
        });

        test('should sort backups by timestamp descending', async () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-03T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            const backups = await service.listBackups();

            expect(backups[0].filename).toContain('2024-01-03');
            expect(backups[1].filename).toContain('2024-01-02');
            expect(backups[2].filename).toContain('2024-01-01');
        });

        test('should return empty array if no backups exist', async () => {
            mockFsExtra.readdir.mockResolvedValue([]);

            const backups = await service.listBackups();

            expect(backups).toEqual([]);
        });

        test('should filter only backup files', async () => {
            const files = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'other-file.txt',
                'not-a-backup.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(files);

            const backups = await service.listBackups();

            expect(backups.length).toBe(1);
            expect(backups[0].filename).toBe(files[0]);
        });

        test('should handle errors reading individual backups', async () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.stat
                .mockRejectedValueOnce(new Error('File not found'))
                .mockResolvedValueOnce({ size: 1024 });

            const backups = await service.listBackups();

            expect(backups.length).toBe(1); // Only the successful one
        });

        test('should return empty array on readdir error', async () => {
            mockFsExtra.readdir.mockRejectedValue(new Error('Directory not found'));

            const backups = await service.listBackups();

            expect(backups).toEqual([]);
        });

        test('listBackupsSync should work synchronously', () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json'
            ];

            mockFsExtra.readdirSync.mockReturnValue(mockBackups);
            mockFsExtra.statSync.mockReturnValue({ size: 1024 });

            const backups = service.listBackupsSync();

            expect(backups.length).toBe(2);
            expect(backups[0].filename).toBe(mockBackups[1]); // Newest first
        });
    });

    describe('Backup Restoration', () => {
        test('should restore from backup successfully', async () => {
            const backupPath = path.join(backupDir, 'graph-state-2024-01-01T10-00-00-000Z.json');
            mockFs.writeFileSync(backupPath, JSON.stringify(createMockStateWithNodes()));
            mockFs.writeFileSync(stateFile, '{}');

            await service.restoreBackup(backupPath);

            expect(mockFsExtra.copy).toHaveBeenCalledWith(backupPath, stateFile);
        });

        test('should throw error if backup file not found', async () => {
            const backupPath = path.join(backupDir, 'nonexistent-backup.json');

            await expect(service.restoreBackup(backupPath))
                .rejects
                .toThrow('Backup file not found');
        });

        test('should create safety backup before restoring', async () => {
            const backupPath = path.join(backupDir, 'graph-state-2024-01-01T10-00-00-000Z.json');
            mockFs.writeFileSync(backupPath, '{}');
            mockFs.writeFileSync(stateFile, '{}');

            await service.restoreBackup(backupPath);

            expect(mockFsExtra.copy).toHaveBeenCalledWith(
                stateFile,
                stateFile + '.before-restore'
            );
        });

        test('should not create safety backup if state file does not exist', async () => {
            const backupPath = path.join(backupDir, 'graph-state-2024-01-01T10-00-00-000Z.json');
            mockFs.writeFileSync(backupPath, '{}');

            await service.restoreBackup(backupPath);

            expect(mockFsExtra.copy).not.toHaveBeenCalledWith(
                stateFile,
                stateFile + '.before-restore'
            );
        });

        test('should throw error if restore fails', async () => {
            const backupPath = path.join(backupDir, 'graph-state-2024-01-01T10-00-00-000Z.json');
            mockFs.writeFileSync(backupPath, '{}');

            mockFsExtra.copy.mockRejectedValue(new Error('Restore failed'));

            await expect(service.restoreBackup(backupPath))
                .rejects
                .toThrow('Restore failed');
        });

        test('restoreLatestBackupSync should restore most recent backup', () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json',
                'graph-state-2024-01-03T10-00-00-000Z.json'
            ];

            mockBackups.forEach(filename => {
                mockFs.writeFileSync(path.join(backupDir, filename), '{}');
            });

            mockFsExtra.readdirSync.mockReturnValue(mockBackups);
            mockFsExtra.statSync.mockReturnValue({ size: 1024 });

            const result = service.restoreLatestBackupSync();

            expect(result).toBe(true);
            expect(mockFsExtra.copyFileSync).toHaveBeenCalledWith(
                expect.stringContaining('2024-01-03'),
                stateFile
            );
        });

        test('restoreLatestBackupSync should return false if no backups', () => {
            mockFsExtra.readdirSync.mockReturnValue([]);

            const result = service.restoreLatestBackupSync();

            expect(result).toBe(false);
        });

        test('restoreLatestBackupSync should return false on error', () => {
            mockFsExtra.readdirSync.mockImplementation(() => {
                throw new Error('Read error');
            });

            const result = service.restoreLatestBackupSync();

            expect(result).toBe(false);
        });
    });

    describe('Backup Pruning', () => {
        test('should keep only MAX_BACKUPS most recent', async () => {
            mockFs.writeFileSync(stateFile, '{}');

            // Create 7 backups (MAX_BACKUPS is 5)
            const mockBackups = Array.from({ length: 7 }, (_, i) =>
                `graph-state-2024-01-${String(i + 1).padStart(2, '0')}T10-00-00-000Z.json`
            );

            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            await service.backupState();

            // Should delete 2 oldest backups
            expect(mockFsExtra.remove).toHaveBeenCalledTimes(2);
        });

        test('should not prune if below MAX_BACKUPS', async () => {
            mockFs.writeFileSync(stateFile, '{}');

            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            await service.backupState();

            // Should not delete any backups
            expect(mockFsExtra.remove).not.toHaveBeenCalled();
        });

        test('should handle errors during individual file deletion', async () => {
            mockFs.writeFileSync(stateFile, '{}');

            const mockBackups = Array.from({ length: 7 }, (_, i) =>
                `graph-state-2024-01-${String(i + 1).padStart(2, '0')}T10-00-00-000Z.json`
            );

            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.remove.mockRejectedValueOnce(new Error('Delete failed'));

            // Should not throw, just log error
            await expect(service.backupState()).resolves.not.toThrow();
        });
    });

    describe('Total Backup Size', () => {
        test('should calculate total size of all backups', async () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json',
                'graph-state-2024-01-03T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.stat.mockResolvedValue({ size: 1024 });

            const totalSize = await service.getTotalBackupSize();

            expect(totalSize).toBe(3072); // 3 * 1024
        });

        test('should return 0 if no backups', async () => {
            mockFsExtra.readdir.mockResolvedValue([]);

            const totalSize = await service.getTotalBackupSize();

            expect(totalSize).toBe(0);
        });
    });

    describe('Delete All Backups', () => {
        test('should delete all backups', async () => {
            const mockBackups = [
                'graph-state-2024-01-01T10-00-00-000Z.json',
                'graph-state-2024-01-02T10-00-00-000Z.json'
            ];

            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            await service.deleteAllBackups();

            expect(mockFsExtra.remove).toHaveBeenCalledTimes(2);
        });

        test('should throw error if deletion fails', async () => {
            const mockBackups = ['graph-state-2024-01-01T10-00-00-000Z.json'];
            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.remove.mockRejectedValue(new Error('Delete failed'));

            await expect(service.deleteAllBackups()).rejects.toThrow('Delete failed');
        });
    });

    describe('Utility Methods', () => {
        test('should return backup directory path', () => {
            const dir = service.getBackupDirectory();

            expect(dir).toBe(backupDir);
        });
    });

    describe('Backup Info', () => {
        test('should include filename in backup info', async () => {
            const mockBackups = ['graph-state-2024-01-01T10-00-00-000Z.json'];
            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            const backups = await service.listBackups();

            expect(backups[0].filename).toBe(mockBackups[0]);
        });

        test('should include full path in backup info', async () => {
            const mockBackups = ['graph-state-2024-01-01T10-00-00-000Z.json'];
            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            const backups = await service.listBackups();

            expect(backups[0].fullPath).toBe(path.join(backupDir, mockBackups[0]));
        });

        test('should include timestamp in backup info', async () => {
            const mockBackups = ['graph-state-2024-01-01T10-00-00-000Z.json'];
            mockFsExtra.readdir.mockResolvedValue(mockBackups);

            const backups = await service.listBackups();

            expect(backups[0].timestamp).toBeInstanceOf(Date);
        });

        test('should include size in backup info', async () => {
            const mockBackups = ['graph-state-2024-01-01T10-00-00-000Z.json'];
            mockFsExtra.readdir.mockResolvedValue(mockBackups);
            mockFsExtra.stat.mockResolvedValue({ size: 2048 });

            const backups = await service.listBackups();

            expect(backups[0].size).toBe(2048);
        });
    });
});
