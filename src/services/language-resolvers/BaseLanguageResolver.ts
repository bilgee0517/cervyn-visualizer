/**
 * Base implementation of LanguageResolver with common functionality
 * 
 * Provides default implementations for common methods that most languages share.
 * Language-specific resolvers can extend this and override only what they need.
 */

import * as path from 'path';
import * as fs from 'fs';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';

/**
 * Base class for language resolvers
 * Provides common functionality that most languages share
 */
export abstract class BaseLanguageResolver implements LanguageResolver {
    public readonly language: string;
    public readonly extensions: string[];
    public readonly displayName: string;
    protected rootPath: string | null = null;

    constructor(language: string, extensions: string[], displayName: string) {
        this.language = language;
        this.extensions = extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`);
        this.displayName = displayName;
    }

    /**
     * Default implementation: check if file extension matches
     * Languages can override for more complex logic (e.g., check file content)
     */
    public canHandle(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return this.extensions.includes(ext);
    }

    /**
     * Abstract method: each language must provide its own parser
     */
    public abstract getParserForFile(filePath: string): ParserInfo | null;

    /**
     * Abstract method: each language must provide its own import extraction
     */
    public abstract extractImports(content: string, sourceFile: string): ImportInfo[];

    /**
     * Default implementation: no symbols extracted
     * Languages can override to provide symbol extraction
     */
    public extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        return { nodes: [], edges: [] };
    }

    /**
     * Default implementation: simple relative path resolution
     * Languages should override to handle their specific module systems
     */
    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Only handle relative imports by default
        if (!importPath.startsWith('.')) {
            return null;
        }

        const targetPath = path.resolve(path.dirname(sourceFile), importPath);
        
        // Try common extensions
        const extensions = this.getSourceFileExtensions().map(ext => 
            ext.startsWith('.') ? ext : `.${ext}`
        );
        
        for (const ext of extensions) {
            const candidate = targetPath + ext;
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        // If it's a directory, try index files
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            for (const ext of extensions) {
                const indexExt = ext.substring(1); // Remove leading dot
                const indexFiles = [`index${ext}`];
                
                // For TypeScript/JavaScript, also try without extension in index
                if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    indexFiles.push('index.ts', 'index.tsx', 'index.js', 'index.jsx');
                }
                
                for (const indexFile of indexFiles) {
                    const candidate = path.join(targetPath, indexFile);
                    if (fs.existsSync(candidate)) {
                        return candidate;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Default implementation: find common entry point patterns
     * Languages should override with their specific conventions
     */
    public async findEntryPoints(rootPath: string): Promise<string[]> {
        const entryPoints: string[] = [];
        
        // Common patterns: index files
        const commonNames = ['index', 'main', 'app'];
        const extensions = this.getSourceFileExtensions();
        
        for (const name of commonNames) {
            for (const ext of extensions) {
                const fullExt = ext.startsWith('.') ? ext : `.${ext}`;
                const candidates = [
                    path.join(rootPath, `${name}${fullExt}`),
                    path.join(rootPath, 'src', `${name}${fullExt}`),
                    path.join(rootPath, 'lib', `${name}${fullExt}`),
                ];
                
                for (const candidate of candidates) {
                    if (fs.existsSync(candidate)) {
                        entryPoints.push(candidate);
                    }
                }
            }
        }
        
        return entryPoints;
    }

    /**
     * Default implementation: return extensions from constructor
     */
    public getSourceFileExtensions(): string[] {
        return this.extensions;
    }

    /**
     * Default implementation: check for common test file patterns
     * Languages should override with their specific patterns
     */
    public isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        const dirName = path.dirname(filePath).toLowerCase();
        
        // Check if in test directory
        if (dirName.includes('test') || dirName.includes('spec') || dirName.includes('__tests__')) {
            return true;
        }
        
        // Check filename patterns
        return fileName.includes('.test.') || 
               fileName.includes('.spec.') || 
               fileName.startsWith('test_') || 
               fileName.endsWith('_test');
    }

    /**
     * Check if a directory name should be excluded from analysis
     */
    protected isExcludedDirectory(dirName: string): boolean {
        const excludedDirs = [
            'node_modules',
            'dist',
            'build',
            'out',
            '.git',
            'coverage',
            '.next',
            '.nuxt',
            '.cache',
            'vendor',
            'target',
            '.vscode',
            '.idea',
            '.vs'
        ];
        return excludedDirs.includes(dirName) || dirName.startsWith('.');
    }

    /**
     * Check if a path (file or directory) should be excluded
     */
    protected isExcludedPath(relativePath: string): boolean {
        // Check if any segment of the path contains excluded directories
        const parts = relativePath.split(path.sep);
        for (const part of parts) {
            if (this.isExcludedDirectory(part)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Default implementation: filter out common build/test/config files
     * Languages should override to add language-specific filters
     */
    public shouldAnalyzeFile(filePath: string): boolean {
        const relativePath = path.relative(this.rootPath || '', filePath);
        
        // Check for excluded directories in the path
        if (this.isExcludedPath(relativePath)) {
            return false;
        }

        // Ignore test files
        if (this.isTestFile(filePath)) {
            return false;
        }

        // Ignore config files
        const configFiles = ['.eslintrc', 'tsconfig', 'package', 'jest.config', 'webpack.config', 
                            'babel.config', '.prettierrc', '.editorconfig'];
        if (configFiles.some(config => relativePath.includes(config))) {
            return false;
        }

        return true;
    }

    /**
     * Default implementation: basic initialization
     * Languages should override to load parsers, read config files, etc.
     */
    public async initialize(rootPath: string): Promise<void> {
        this.rootPath = rootPath;
        log(`[${this.displayName}Resolver] Initialized for root: ${rootPath}`);
    }

    /**
     * Default implementation: no cleanup needed
     * Languages should override if they need to dispose resources
     */
    public dispose(): void {
        this.rootPath = null;
    }

    /**
     * Helper: read a file safely
     */
    protected readFile(filePath: string): string | null {
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
        } catch (error) {
            log(`[${this.displayName}Resolver] Error reading file ${filePath}: ${error}`);
        }
        return null;
    }

    /**
     * Helper: check if a file exists
     */
    protected fileExists(filePath: string): boolean {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    }

    /**
     * Helper: check if a path is a directory
     */
    protected isDirectory(filePath: string): boolean {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch {
            return false;
        }
    }
}



