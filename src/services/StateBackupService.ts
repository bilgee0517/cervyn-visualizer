/**
 * State Backup Service
 * 
 * Manages rotating backups of the graph state file.
 * Provides backup creation, restoration, and pruning functionality.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { getSharedStateDir, getSharedStateFile } from '../config/shared-state-config';
import { log } from '../logger';

export interface BackupInfo {
  filename: string;
  fullPath: string;
  timestamp: Date;
  size: number;
}

/**
 * State Backup Service
 * Handles creating, listing, restoring, and pruning state file backups
 */
export class StateBackupService {
  private readonly MAX_BACKUPS: number;
  private readonly backupDir: string;

  constructor(maxBackups: number = 5) {
    this.MAX_BACKUPS = maxBackups;
    this.backupDir = path.join(getSharedStateDir(), 'backups');
    this.ensureBackupDirectory();
  }

  /**
   * Ensure the backup directory exists
   */
  private ensureBackupDirectory(): void {
    try {
      fs.ensureDirSync(this.backupDir);
      log(`[StateBackupService] ✓ Backup directory ready: ${this.backupDir}`);
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to create backup directory: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Create a backup of the current state file
   * @returns Path to the created backup file
   */
  async backupState(): Promise<string> {
    const stateFile = getSharedStateFile();

    // Check if state file exists
    if (!fs.existsSync(stateFile)) {
      log(`[StateBackupService] ⚠️  State file does not exist, skipping backup`);
      return '';
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `graph-state-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupFilename);

      // Copy current state to backup
      await fs.copy(stateFile, backupPath);

      const stats = await fs.stat(backupPath);
      log(`[StateBackupService] ✓ Backup created: ${backupFilename} (${(stats.size / 1024).toFixed(2)} KB)`);

      // Prune old backups after creating new one
      await this.pruneOldBackups();

      return backupPath;
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to create backup: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * List all available backups
   * @returns Array of backup information, sorted by timestamp (newest first)
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter((f: string) => 
        f.startsWith('graph-state-') && f.endsWith('.json')
      );

      const backups: BackupInfo[] = [];

      for (const filename of backupFiles) {
        const fullPath = path.join(this.backupDir, filename);
        try {
          const stats = await fs.stat(fullPath);
          
          // Extract timestamp from filename (graph-state-YYYY-MM-DDTHH-MM-SS-sssZ.json)
          const timestampStr = filename
            .replace('graph-state-', '')
            .replace('.json', '')
            .replace(/-/g, (match: string, offset: number, string: string) => {
              // Replace hyphens with colons for time part
              const beforeT = string.indexOf('T');
              if (offset > beforeT) {
                return ':';
              }
              return match;
            });

          backups.push({
            filename,
            fullPath,
            timestamp: new Date(timestampStr),
            size: stats.size
          });
        } catch (err) {
          log(`[StateBackupService] ⚠️  Error reading backup ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Sort by timestamp, newest first
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return backups;
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to list backups: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * List all available backups (synchronous version for error recovery)
   * @returns Array of backup information, sorted by timestamp (newest first)
   */
  listBackupsSync(): BackupInfo[] {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backupFiles = files.filter((f: string) => 
        f.startsWith('graph-state-') && f.endsWith('.json')
      );

      const backups: BackupInfo[] = [];

      for (const filename of backupFiles) {
        const fullPath = path.join(this.backupDir, filename);
        try {
          const stats = fs.statSync(fullPath);
          
          // Extract timestamp from filename (graph-state-YYYY-MM-DDTHH-MM-SS-sssZ.json)
          const timestampStr = filename
            .replace('graph-state-', '')
            .replace('.json', '')
            .replace(/-/g, (match: string, offset: number, string: string) => {
              // Replace hyphens with colons for time part
              const beforeT = string.indexOf('T');
              if (offset > beforeT) {
                return ':';
              }
              return match;
            });

          backups.push({
            filename,
            fullPath,
            timestamp: new Date(timestampStr),
            size: stats.size
          });
        } catch (err) {
          log(`[StateBackupService] ⚠️  Error reading backup ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Sort by timestamp, newest first
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return backups;
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to list backups: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Restore state from a backup file
   * @param backupPath Path to the backup file to restore
   */
  async restoreBackup(backupPath: string): Promise<void> {
    const stateFile = getSharedStateFile();

    try {
      // Verify backup file exists
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Create a backup of current state before restoring (safety net)
      if (fs.existsSync(stateFile)) {
        const safetyBackup = stateFile + '.before-restore';
        await fs.copy(stateFile, safetyBackup);
        log(`[StateBackupService] Created safety backup: ${safetyBackup}`);
      }

      // Restore the backup
      await fs.copy(backupPath, stateFile);

      log(`[StateBackupService] ✓ State restored from backup: ${path.basename(backupPath)}`);
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to restore backup: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Restore state from the latest backup (synchronous version for error recovery)
   * Returns true if successful, false otherwise
   */
  restoreLatestBackupSync(): boolean {
    const stateFile = getSharedStateFile();

    try {
      const backups = this.listBackupsSync();
      
      if (backups.length === 0) {
        log(`[StateBackupService] No backups available for restoration`);
        return false;
      }

      const latestBackup = backups[0];
      
      // Verify backup file exists
      if (!fs.existsSync(latestBackup.fullPath)) {
        log(`[StateBackupService] ❌ Backup file not found: ${latestBackup.fullPath}`);
        return false;
      }

      // Create a backup of current state before restoring (safety net)
      if (fs.existsSync(stateFile)) {
        const safetyBackup = stateFile + '.before-restore';
        fs.copyFileSync(stateFile, safetyBackup);
        log(`[StateBackupService] Created safety backup: ${safetyBackup}`);
      }

      // Restore the backup
      fs.copyFileSync(latestBackup.fullPath, stateFile);

      log(`[StateBackupService] ✓ State restored from backup: ${latestBackup.filename}`);
      return true;
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to restore backup: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Prune old backups, keeping only the most recent MAX_BACKUPS
   */
  private async pruneOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      if (backups.length <= this.MAX_BACKUPS) {
        return; // No pruning needed
      }

      const toDelete = backups.slice(this.MAX_BACKUPS);

      for (const backup of toDelete) {
        try {
          await fs.remove(backup.fullPath);
          log(`[StateBackupService] Pruned old backup: ${backup.filename}`);
        } catch (err) {
          log(`[StateBackupService] ⚠️  Failed to delete backup ${backup.filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      log(`[StateBackupService] ✓ Pruned ${toDelete.length} old backup(s), keeping ${this.MAX_BACKUPS} most recent`);
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to prune backups: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get the total size of all backups
   * @returns Total size in bytes
   */
  async getTotalBackupSize(): Promise<number> {
    const backups = await this.listBackups();
    return backups.reduce((total, backup) => total + backup.size, 0);
  }

  /**
   * Delete all backups (use with caution)
   */
  async deleteAllBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      for (const backup of backups) {
        await fs.remove(backup.fullPath);
      }

      log(`[StateBackupService] ✓ Deleted all ${backups.length} backup(s)`);
    } catch (err) {
      log(`[StateBackupService] ❌ Failed to delete all backups: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Get the backup directory path
   */
  getBackupDirectory(): string {
    return this.backupDir;
  }
}

// Singleton instance for convenience
export const stateBackupService = new StateBackupService();
