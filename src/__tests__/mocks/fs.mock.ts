/**
 * Mock file system module for testing
 * Provides in-memory file system simulation
 */

import { EventEmitter } from 'events';

export class MockFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();
    private watchers: Map<string, MockFSWatcher> = new Map();

    constructor() {
        // Always ensure root directory exists
        this.directories.add('/');
    }

    // File operations
    existsSync(path: string): boolean {
        return this.files.has(path) || this.directories.has(path);
    }

    readFileSync(path: string, encoding?: string): string {
        if (!this.files.has(path)) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        return this.files.get(path)!;
    }

    writeFileSync(path: string, data: string, encoding?: string): void {
        // Ensure parent directory exists
        const parentDir = path.substring(0, path.lastIndexOf('/'));
        if (parentDir && !this.directories.has(parentDir)) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        this.files.set(path, data);
        this.emitFileChange(path, 'change');
    }

    unlinkSync(path: string): void {
        if (!this.files.has(path)) {
            throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        }
        this.files.delete(path);
        this.emitFileChange(path, 'rename');
    }

    renameSync(oldPath: string, newPath: string): void {
        if (!this.files.has(oldPath)) {
            throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
        }
        const data = this.files.get(oldPath)!;
        this.files.delete(oldPath);
        this.files.set(newPath, data);

        // Emit rename event for the directory being watched
        const dir = newPath.substring(0, newPath.lastIndexOf('/'));
        const filename = newPath.substring(newPath.lastIndexOf('/') + 1);
        this.emitDirectoryChange(dir, 'rename', filename);
    }

    // Directory operations
    mkdirSync(path: string, options?: { recursive?: boolean }): void {
        if (options?.recursive) {
            const parts = path.split('/').filter(p => p);
            let currentPath = '/';
            for (const part of parts) {
                currentPath = currentPath === '/' ? `/${part}` : `${currentPath}/${part}`;
                this.directories.add(currentPath);
            }
        } else {
            if (this.directories.has(path)) {
                throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
            }
            this.directories.add(path);
        }
    }

    rmdirSync(path: string): void {
        if (!this.directories.has(path)) {
            throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
        }
        // Check if directory has contents
        const hasContents = Array.from(this.files.keys()).some(f => f.startsWith(path + '/')) ||
                           Array.from(this.directories).some(d => d.startsWith(path + '/') && d !== path);
        if (hasContents) {
            throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
        }
        this.directories.delete(path);
    }

    // File watching
    watch(path: string, callback: (eventType: string, filename: string | null) => void): MockFSWatcher {
        const watcher = new MockFSWatcher(path, callback);
        this.watchers.set(path, watcher);
        return watcher;
    }

    // Helper methods for testing
    private emitFileChange(path: string, eventType: string): void {
        const watcher = this.watchers.get(path);
        if (watcher && !watcher.closed) {
            const filename = path.substring(path.lastIndexOf('/') + 1);
            watcher.emit(eventType, filename);
        }
    }

    private emitDirectoryChange(dir: string, eventType: string, filename: string): void {
        const watcher = this.watchers.get(dir);
        if (watcher && !watcher.closed) {
            watcher.emit(eventType, filename);
        }
    }

    // Simulate external file write (e.g., from MCP server)
    simulateExternalWrite(path: string, data: string): void {
        const dir = path.substring(0, path.lastIndexOf('/'));
        const filename = path.substring(path.lastIndexOf('/') + 1);

        this.files.set(path, data);

        // Emit directory watch event
        this.emitDirectoryChange(dir, 'rename', filename);
    }

    // Reset mock state
    reset(): void {
        this.files.clear();
        this.directories.clear();
        this.watchers.forEach(w => w.close());
        this.watchers.clear();
        this.directories.add('/');
    }

    // Get current state for debugging
    getState() {
        return {
            files: Array.from(this.files.keys()),
            directories: Array.from(this.directories),
            watchers: Array.from(this.watchers.keys())
        };
    }

    // Get a specific watcher for testing
    getWatcher(path: string): MockFSWatcher | undefined {
        return this.watchers.get(path);
    }
}

export class MockFSWatcher extends EventEmitter {
    public closed: boolean = false;
    private errorHandler?: (err: Error) => void;

    constructor(
        public path: string,
        private callback: (eventType: string, filename: string | null) => void
    ) {
        super();

        // Forward events to callback
        this.on('change', (filename) => this.callback('change', filename));
        this.on('rename', (filename) => this.callback('rename', filename));
    }

    close(): void {
        this.closed = true;
        this.removeAllListeners();
    }

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'change' | 'rename', listener: (filename: string) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        if (event === 'error') {
            this.errorHandler = listener;
        }
        return super.on(event, listener);
    }

    // Simulate watcher error
    simulateError(error: Error): void {
        this.emit('error', error);
    }
}

// Create singleton instance
export const mockFs = new MockFileSystem();

// Export mock functions that match fs module API
export const existsSync = (path: string) => mockFs.existsSync(path);
export const readFileSync = (path: string, encoding?: string) => mockFs.readFileSync(path, encoding);
export const writeFileSync = (path: string, data: string, encoding?: string) => mockFs.writeFileSync(path, data, encoding);
export const unlinkSync = (path: string) => mockFs.unlinkSync(path);
export const renameSync = (oldPath: string, newPath: string) => mockFs.renameSync(oldPath, newPath);
export const mkdirSync = (path: string, options?: { recursive?: boolean }) => mockFs.mkdirSync(path, options);
export const rmdirSync = (path: string) => mockFs.rmdirSync(path);
export const watch = (path: string, callback: (eventType: string, filename: string | null) => void) => mockFs.watch(path, callback);
