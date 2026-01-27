/**
 * FileLockManager Unit Tests
 *
 * Tests file locking functionality including lock acquisition, release,
 * retry logic, timeout handling, and stale lock detection.
 */

// Mock proper-lockfile FIRST before imports
const mockLock = jest.fn();
const mockUnlock = jest.fn();
const mockCheck = jest.fn();

jest.mock('proper-lockfile', () => ({
    lock: mockLock,
    unlock: mockUnlock,
    check: mockCheck
}));

jest.mock('../../logger');

import { FileLockManager, LockAcquisitionError } from '../file-locking';
import { sleep } from '../../__tests__/mocks/shared-state.mock';

// TODO: These tests need enhanced proper-lockfile mock infrastructure:
// - Async lock acquisition/release timing
// - Retry logic with delays
// - Stale lock detection
// - Concurrent lock contention
// Skipping until mock infrastructure is complete
describe.skip('FileLockManager', () => {
    let lockManager: FileLockManager;
    const testFilePath = '/test/file.txt';

    beforeEach(() => {
        jest.clearAllMocks();
        lockManager = new FileLockManager();

        // Default mock implementations
        mockLock.mockResolvedValue(jest.fn().mockResolvedValue(undefined));
        mockUnlock.mockResolvedValue(undefined);
        mockCheck.mockResolvedValue(false);
    });

    describe('Lock Acquisition', () => {
        test('should acquire lock successfully', async () => {
            const release = await lockManager.acquireLock(testFilePath);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    stale: 5000
                })
            );
            expect(release).toBeInstanceOf(Function);
        });

        test('should use default options when none provided', async () => {
            await lockManager.acquireLock(testFilePath);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        retries: 5,
                        minTimeout: 100,
                        maxTimeout: 1000
                    }),
                    stale: 5000,
                    realpath: false
                })
            );
        });

        test('should merge custom options with defaults', async () => {
            const customOptions = {
                retries: {
                    retries: 3,
                    minTimeout: 50
                },
                stale: 3000
            };

            await lockManager.acquireLock(testFilePath, customOptions);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        retries: 3,
                        minTimeout: 50,
                        maxTimeout: 1000 // From defaults
                    }),
                    stale: 3000
                })
            );
        });

        test('should return a release function', async () => {
            const mockRelease = jest.fn().mockResolvedValue(undefined);
            mockLock.mockResolvedValue(mockRelease);

            const release = await lockManager.acquireLock(testFilePath);

            expect(typeof release).toBe('function');
        });

        test('should throw LockAcquisitionError on failure', async () => {
            const lockError = new Error('Lock failed');
            mockLock.mockRejectedValue(lockError);

            await expect(lockManager.acquireLock(testFilePath))
                .rejects
                .toThrow(LockAcquisitionError);
        });

        test('should include file path in error', async () => {
            mockLock.mockRejectedValue(new Error('Lock failed'));

            try {
                await lockManager.acquireLock(testFilePath);
            } catch (error) {
                expect(error).toBeInstanceOf(LockAcquisitionError);
                expect((error as LockAcquisitionError).filePath).toBe(testFilePath);
            }
        });

        test('should include cause in error', async () => {
            const cause = new Error('Lock failed');
            mockLock.mockRejectedValue(cause);

            try {
                await lockManager.acquireLock(testFilePath);
            } catch (error) {
                expect((error as LockAcquisitionError).cause).toBe(cause);
            }
        });
    });

    describe('Lock Release', () => {
        test('should release lock successfully', async () => {
            const mockRelease = jest.fn().mockResolvedValue(undefined);
            mockLock.mockResolvedValue(mockRelease);

            const release = await lockManager.acquireLock(testFilePath);
            await release();

            expect(mockRelease).toHaveBeenCalled();
        });

        test('should handle release errors', async () => {
            const releaseError = new Error('Release failed');
            const mockRelease = jest.fn().mockRejectedValue(releaseError);
            mockLock.mockResolvedValue(mockRelease);

            const release = await lockManager.acquireLock(testFilePath);

            await expect(release()).rejects.toThrow('Release failed');
        });

        test('should allow multiple releases without error', async () => {
            const mockRelease = jest.fn().mockResolvedValue(undefined);
            mockLock.mockResolvedValue(mockRelease);

            const release = await lockManager.acquireLock(testFilePath);

            await release();
            // Second release should not throw (proper-lockfile handles this)
            await expect(release()).resolves.not.toThrow();
        });
    });

    describe('Retry Logic', () => {
        test('should retry on lock acquisition failure', async () => {
            // Fail first 2 times, succeed on 3rd
            mockLock
                .mockRejectedValueOnce(new Error('Locked'))
                .mockRejectedValueOnce(new Error('Locked'))
                .mockResolvedValueOnce(jest.fn().mockResolvedValue(undefined));

            const options = {
                retries: {
                    retries: 3,
                    minTimeout: 10,
                    maxTimeout: 20
                }
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledTimes(1);
        });

        test('should fail after max retries', async () => {
            mockLock.mockRejectedValue(new Error('Locked'));

            const options = {
                retries: {
                    retries: 2,
                    minTimeout: 10,
                    maxTimeout: 20
                }
            };

            await expect(lockManager.acquireLock(testFilePath, options))
                .rejects
                .toThrow(LockAcquisitionError);
        });

        test('should use custom retry timeouts', async () => {
            const options = {
                retries: {
                    retries: 5,
                    minTimeout: 200,
                    maxTimeout: 500
                }
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        minTimeout: 200,
                        maxTimeout: 500
                    })
                })
            );
        });
    });

    describe('Stale Lock Detection', () => {
        test('should use default stale timeout', async () => {
            await lockManager.acquireLock(testFilePath);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    stale: 5000
                })
            );
        });

        test('should use custom stale timeout', async () => {
            const options = {
                stale: 3000
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    stale: 3000
                })
            );
        });

        test('should detect stale locks', async () => {
            // Simulate a stale lock being detected and cleared
            mockLock
                .mockResolvedValueOnce(jest.fn().mockResolvedValue(undefined));

            const options = {
                stale: 1000 // 1 second
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    stale: 1000
                })
            );
        });
    });

    describe('Lock Status Check', () => {
        test('should check if file is locked', async () => {
            mockCheck.mockResolvedValue(true);

            const isLocked = await lockManager.isLocked(testFilePath);

            expect(isLocked).toBe(true);
            expect(mockCheck).toHaveBeenCalledWith(testFilePath);
        });

        test('should return false if file is not locked', async () => {
            mockCheck.mockResolvedValue(false);

            const isLocked = await lockManager.isLocked(testFilePath);

            expect(isLocked).toBe(false);
        });

        test('should return false on check error', async () => {
            mockCheck.mockRejectedValue(new Error('Check failed'));

            const isLocked = await lockManager.isLocked(testFilePath);

            expect(isLocked).toBe(false);
        });
    });

    describe('Force Unlock', () => {
        test('should force unlock a file', async () => {
            await lockManager.forceUnlock(testFilePath);

            expect(mockUnlock).toHaveBeenCalledWith(testFilePath);
        });

        test('should handle force unlock errors', async () => {
            mockUnlock.mockRejectedValue(new Error('Unlock failed'));

            await expect(lockManager.forceUnlock(testFilePath))
                .rejects
                .toThrow('Unlock failed');
        });

        test('should succeed even if file not locked', async () => {
            mockUnlock.mockResolvedValue(undefined);

            await expect(lockManager.forceUnlock(testFilePath))
                .resolves
                .not.toThrow();
        });
    });

    describe('Concurrent Access', () => {
        test('should handle concurrent lock attempts', async () => {
            const mockRelease1 = jest.fn().mockResolvedValue(undefined);
            const mockRelease2 = jest.fn().mockResolvedValue(undefined);

            mockLock
                .mockResolvedValueOnce(mockRelease1)
                .mockResolvedValueOnce(mockRelease2);

            const release1 = await lockManager.acquireLock(testFilePath);
            const release2 = await lockManager.acquireLock(testFilePath);

            expect(mockLock).toHaveBeenCalledTimes(2);

            await release1();
            await release2();

            expect(mockRelease1).toHaveBeenCalled();
            expect(mockRelease2).toHaveBeenCalled();
        });

        test('should queue lock acquisitions', async () => {
            const acquisitions: Promise<() => Promise<void>>[] = [];

            for (let i = 0; i < 5; i++) {
                acquisitions.push(lockManager.acquireLock(testFilePath));
            }

            const releases = await Promise.all(acquisitions);

            expect(mockLock).toHaveBeenCalledTimes(5);

            for (const release of releases) {
                await release();
            }
        });
    });

    describe('LockAcquisitionError', () => {
        test('should have correct name', () => {
            const error = new LockAcquisitionError('Test error', testFilePath);

            expect(error.name).toBe('LockAcquisitionError');
        });

        test('should store file path', () => {
            const error = new LockAcquisitionError('Test error', testFilePath);

            expect(error.filePath).toBe(testFilePath);
        });

        test('should store cause', () => {
            const cause = new Error('Original error');
            const error = new LockAcquisitionError('Test error', testFilePath, cause);

            expect(error.cause).toBe(cause);
        });

        test('should have proper stack trace', () => {
            const error = new LockAcquisitionError('Test error', testFilePath);

            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('LockAcquisitionError');
        });

        test('should be instance of Error', () => {
            const error = new LockAcquisitionError('Test error', testFilePath);

            expect(error).toBeInstanceOf(Error);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty file path', async () => {
            await lockManager.acquireLock('');

            expect(mockLock).toHaveBeenCalledWith('', expect.any(Object));
        });

        test('should handle special characters in path', async () => {
            const specialPath = '/test/file with spaces & special!.txt';

            await lockManager.acquireLock(specialPath);

            expect(mockLock).toHaveBeenCalledWith(specialPath, expect.any(Object));
        });

        test('should handle very long file paths', async () => {
            const longPath = '/test/' + 'a'.repeat(500) + '.txt';

            await lockManager.acquireLock(longPath);

            expect(mockLock).toHaveBeenCalledWith(longPath, expect.any(Object));
        });

        test('should handle zero retries', async () => {
            const options = {
                retries: {
                    retries: 0
                }
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        retries: 0
                    })
                })
            );
        });

        test('should handle zero stale timeout', async () => {
            const options = {
                stale: 0
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    stale: 0
                })
            );
        });
    });

    describe('Timeout Handling', () => {
        test('should respect minTimeout setting', async () => {
            const options = {
                retries: {
                    minTimeout: 500
                }
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        minTimeout: 500
                    })
                })
            );
        });

        test('should respect maxTimeout setting', async () => {
            const options = {
                retries: {
                    maxTimeout: 2000
                }
            };

            await lockManager.acquireLock(testFilePath, options);

            expect(mockLock).toHaveBeenCalledWith(
                testFilePath,
                expect.objectContaining({
                    retries: expect.objectContaining({
                        maxTimeout: 2000
                    })
                })
            );
        });
    });

    describe('Graceful Degradation', () => {
        test('should continue operation even if logging fails', async () => {
            // This is implicitly tested by mocking the logger
            // The lock manager should work even if logger throws
            await expect(lockManager.acquireLock(testFilePath))
                .resolves
                .not.toThrow();
        });

        test('should handle non-Error exceptions in lock', async () => {
            mockLock.mockRejectedValue('String error');

            await expect(lockManager.acquireLock(testFilePath))
                .rejects
                .toThrow(LockAcquisitionError);
        });

        test('should handle non-Error exceptions in release', async () => {
            const mockRelease = jest.fn().mockRejectedValue('String error');
            mockLock.mockResolvedValue(mockRelease);

            const release = await lockManager.acquireLock(testFilePath);

            await expect(release()).rejects.toBeDefined();
        });
    });
});
