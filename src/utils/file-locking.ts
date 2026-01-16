/**
 * File Locking Utility
 * 
 * Cross-platform file locking using proper-lockfile library.
 * Provides lock acquisition with retry logic, timeout handling, and stale lock detection.
 */

import * as lockfile from 'proper-lockfile';
import { log } from '../logger';

export interface LockOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  stale?: number;
}

/**
 * File Lock Manager
 * Handles acquiring and releasing file locks with proper error handling
 */
export class FileLockManager {
  private readonly DEFAULT_OPTIONS: lockfile.LockOptions = {
    retries: {
      retries: 5,
      minTimeout: 100,
      maxTimeout: 1000,
      randomize: true
    },
    stale: 5000, // Consider lock stale after 5s
    realpath: false, // Don't resolve symlinks
    fs: undefined // Use default fs module
  };

  /**
   * Acquire a lock on the specified file
   * @param filePath Path to the file to lock
   * @param options Optional lock options
   * @returns A release function to unlock the file
   */
  async acquireLock(
    filePath: string, 
    options: any = {}
  ): Promise<() => Promise<void>> {
    const mergedOptions: any = Object.assign({}, this.DEFAULT_OPTIONS, options);
    
    // Merge retries separately if provided
    if (options.retries && this.DEFAULT_OPTIONS.retries) {
      mergedOptions.retries = Object.assign({}, this.DEFAULT_OPTIONS.retries, options.retries);
    }

    try {
      log(`[FileLockManager] Acquiring lock on: ${filePath}`);
      const release = await lockfile.lock(filePath, mergedOptions);
      log(`[FileLockManager] ✓ Lock acquired: ${filePath}`);
      
      // Return a wrapped release function with logging
      return async () => {
        try {
          await release();
          log(`[FileLockManager] ✓ Lock released: ${filePath}`);
        } catch (err) {
          log(`[FileLockManager] ⚠️  Error releasing lock: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      };
    } catch (err) {
      log(`[FileLockManager] ❌ Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`);
      throw new LockAcquisitionError(
        `Failed to acquire lock on ${filePath}`,
        filePath,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Check if a file is currently locked
   * @param filePath Path to the file
   * @returns True if locked, false otherwise
   */
  async isLocked(filePath: string): Promise<boolean> {
    try {
      return await lockfile.check(filePath);
    } catch (err) {
      log(`[FileLockManager] Error checking lock status: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Force unlock a file (use with caution - only for stale locks)
   * @param filePath Path to the file
   */
  async forceUnlock(filePath: string): Promise<void> {
    try {
      log(`[FileLockManager] Force unlocking: ${filePath}`);
      await lockfile.unlock(filePath);
      log(`[FileLockManager] ✓ Force unlock successful: ${filePath}`);
    } catch (err) {
      log(`[FileLockManager] ⚠️  Error during force unlock: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
}

/**
 * Custom error for lock acquisition failures
 */
export class LockAcquisitionError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LockAcquisitionError';
    
    // Maintain proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LockAcquisitionError);
    }
  }
}

// Singleton instance for convenience
export const fileLockManager = new FileLockManager();
