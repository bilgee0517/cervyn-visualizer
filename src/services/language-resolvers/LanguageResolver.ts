/**
 * Language resolver interface for multi-language support
 * 
 * Each language implements this interface to provide:
 * - Import/export extraction using tree-sitter
 * - Module path resolution specific to the language
 * - Entry point discovery
 * - Language-specific AST parsing
 */

import { GraphEdge, GraphNode } from '../../types';
import Parser from 'tree-sitter';

/**
 * Information about an import statement extracted from source code
 */
export interface ImportInfo {
    /** The import path as it appears in source (e.g., './utils', '@app/components', 'fs') */
    importPath: string;
    /** Type of import: 'relative', 'absolute', 'package', 'alias' */
    importType: 'relative' | 'absolute' | 'package' | 'alias';
    /** Line number where the import appears */
    lineNumber?: number;
    /** Names imported (for languages that support this) */
    importedNames?: string[];
}

/**
 * Parser information for a file
 */
export interface ParserInfo {
    parser: Parser;
    language: any;
}

/**
 * Language resolver interface
 * Each language must implement this to provide language-specific parsing and resolution
 */
export interface LanguageResolver {
    /** Language identifier (e.g., 'typescript', 'python', 'go') */
    readonly language: string;
    
    /** File extensions this resolver handles (e.g., ['.ts', '.tsx']) */
    readonly extensions: string[];
    
    /** Human-readable language name */
    readonly displayName: string;
    
    /**
     * Check if this resolver can handle a file based on its path/extension
     */
    canHandle(filePath: string): boolean;
    
    /**
     * Get the appropriate tree-sitter parser for a file
     * Returns null if parser is not available or file cannot be parsed
     */
    getParserForFile(filePath: string): ParserInfo | null;
    
    /**
     * Extract all import statements from source code
     * Uses tree-sitter queries specific to the language
     */
    extractImports(content: string, sourceFile: string): ImportInfo[];
    
    /**
     * Extract symbols (classes, functions, interfaces, etc.) from source code
     * Returns nodes and edges representing the symbols and their relationships
     */
    extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] };
    
    /**
     * Resolve an import path to an absolute file path
     * Handles language-specific module resolution (e.g., tsconfig paths, Python packages, Go modules)
     */
    resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null;
    
    /**
     * Find entry points for a project in the given root path
     * Each language has different conventions (package.json, main.py, main.go, etc.)
     */
    findEntryPoints(rootPath: string): Promise<string[]>;
    
    /**
     * Get file extensions to scan for this language
     * Used for discovering files in the workspace
     */
    getSourceFileExtensions(): string[];
    
    /**
     * Check if a file is a test file for this language
     */
    isTestFile(filePath: string): boolean;
    
    /**
     * Check if a file should be analyzed (not config/build/test file)
     */
    shouldAnalyzeFile(filePath: string): boolean;
    
    /**
     * Initialize the resolver (load parsers, read config files, etc.)
     * Called once when the resolver is registered
     */
    initialize(rootPath: string): Promise<void>;
    
    /**
     * Dispose resources (close parsers, clear caches, etc.)
     */
    dispose(): void;
}



