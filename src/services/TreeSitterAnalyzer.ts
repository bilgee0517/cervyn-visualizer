/**
 * Tree-sitter based code analyzer
 * 
 * @deprecated This class is maintained for backward compatibility.
 * New code should use the LanguageResolver system directly via ResolverRegistry.
 * This class now delegates to the resolver system when available.
 * 
 * Provides accurate AST-based parsing for TypeScript/JavaScript files
 * Falls back to regex if tree-sitter fails or is unavailable
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../logger';
import { GraphNode, GraphEdge } from '../types';
import { getResolverRegistry } from './language-resolvers';

// Import TypeScript parsers
// Using require() for tree-sitter modules as they need to be loaded dynamically
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TypeScriptModule = require('tree-sitter-typescript');
const TypeScript = TypeScriptModule.typescript;
const TSX = TypeScriptModule.tsx;

// Import JavaScript parser - tree-sitter-javascript is included as a transitive dependency
let JavaScript: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    JavaScript = require('tree-sitter-javascript');
} catch (e) {
    // If not available, we'll use TypeScript parser as fallback for JS files
    log('[TreeSitterAnalyzer] JavaScript parser not available, will use TypeScript parser for JS files');
}

// Type definitions for tree-sitter query captures
interface QueryCapture {
    name: string;
    node: {
        text: string;
        type: string;
        parent: any;
    };
}

export class TreeSitterAnalyzer {
    private parser: Parser;
    private tsParser: Parser;
    private tsxParser: Parser;
    private jsParser: Parser;
    private tsLanguage: any;
    private tsxLanguage: any;
    private jsLanguage: any;
    private initialized: boolean = false;
    private rootPath: string | null = null;

    constructor(rootPath?: string) {
        this.rootPath = rootPath || null;
        this.parser = new Parser();
        this.tsParser = new Parser();
        this.tsxParser = new Parser();
        this.jsParser = new Parser();
        this.initialize();
    }

    /**
     * Set the root path for import resolution
     */
    public setRootPath(rootPath: string): void {
        this.rootPath = rootPath;
    }

    private initialize(): void {
        try {
            log('[TreeSitterAnalyzer] Starting initialization...');
            log(`[TreeSitterAnalyzer] TypeScript module: ${!!TypeScriptModule}, TypeScript: ${!!TypeScript}, TSX: ${!!TSX}`);
            
            this.tsLanguage = TypeScript;
            this.tsxLanguage = TSX;
            this.tsParser.setLanguage(TypeScript);
            this.tsxParser.setLanguage(TSX);
            log('[TreeSitterAnalyzer] TypeScript and TSX parsers configured');
            
            if (JavaScript) {
                this.jsLanguage = JavaScript;
                this.jsParser.setLanguage(JavaScript);
                log('[TreeSitterAnalyzer] JavaScript parser configured');
            } else {
                // Fallback to TypeScript parser for JS files
                this.jsLanguage = TypeScript;
                this.jsParser.setLanguage(TypeScript);
                log('[TreeSitterAnalyzer] Using TypeScript parser as fallback for JavaScript files');
            }
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(TypeScript, '(import_statement source: (string) @path)');
                log(`[TreeSitterAnalyzer] Query test successful`);
            } catch (queryError) {
                log(`[TreeSitterAnalyzer] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[TreeSitterAnalyzer] ✓ Initialized successfully');
        } catch (error) {
            log(`[TreeSitterAnalyzer] ✗ Initialization failed: ${error}`);
            log(`[TreeSitterAnalyzer] Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
            this.initialized = false;
        }
    }

    /**
     * Get the appropriate parser and language for a file based on its extension
     */
    private getParserForFile(filePath: string): { parser: Parser; language: any } | null {
        if (!this.initialized) {
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.ts':
                return { parser: this.tsParser, language: this.tsLanguage };
            case '.tsx':
                return { parser: this.tsxParser, language: this.tsxLanguage };
            case '.js':
            case '.mjs':
            case '.cjs':
                return { parser: this.jsParser, language: this.jsLanguage };
            case '.jsx':
                return { parser: this.jsParser, language: this.jsLanguage }; // JavaScript parser handles JSX
            default:
                // Default to TypeScript for unknown extensions
                return { parser: this.tsParser, language: this.tsLanguage };
        }
    }

    /**
     * Extract import statements from code using tree-sitter
     * Delegates to resolver system when available, falls back to legacy implementation
     */
    public extractImports(content: string, sourceFile: string): GraphEdge[] {
        // Try to use resolver system first
        try {
            const registry = getResolverRegistry();
            const resolver = registry.getResolverForFile(sourceFile);
            if (resolver) {
                const importInfos = resolver.extractImports(content, sourceFile);
                const rootPath = this.rootPath || path.dirname(sourceFile);
                const edges: GraphEdge[] = [];
                
                for (const importInfo of importInfos) {
                    // Only process relative imports for now (maintains backward compatibility)
                    if (importInfo.importType === 'relative' || importInfo.importPath.startsWith('.')) {
                        const rootPathForResolution = this.rootPath || path.dirname(sourceFile);
                        const targetPath = resolver.resolveImportPath(importInfo.importPath, sourceFile, rootPathForResolution);
                        if (targetPath) {
                            edges.push({
                                data: {
                                    id: `import-${sourceFile}-${targetPath}`,
                                    source: sourceFile,
                                    target: targetPath,
                                    edgeType: 'imports'
                                }
                            });
                            log(`  ✓ Resolved (resolver): ${importInfo.importPath} -> ${path.basename(targetPath)}`);
                        }
                    }
                }
                
                if (edges.length > 0) {
                    return edges;
                }
            }
        } catch (error) {
            log(`[TreeSitterAnalyzer] Error using resolver system: ${error}. Falling back to legacy implementation.`);
        }

        // Fallback to legacy implementation
        const parserInfo = this.getParserForFile(sourceFile);
        if (!parserInfo) {
            return this.fallbackExtractImports(content, sourceFile);
        }

        try {
            const { parser, language } = parserInfo;
            // Tree-sitter has a default buffer size of 32KB. Files larger than this will fail with
            // "Invalid argument" error. We set bufferSize dynamically to handle larger files.
            const bufferSize = Math.max(500000, content.length * 2); // At least 500KB, or 2x file size
            const tree = parser.parse(content, undefined, { bufferSize });
            const edges: GraphEdge[] = [];

            // Query for import statements using the correct Query API
            // This handles: import ... from "...", import type ... from "...", export ... from "..."
            // Note: import_type_clause is not a valid node type in tree-sitter TypeScript
            // Type imports are still import_statement nodes
            const Query = Parser.Query;
            const queryString = `
                (import_statement 
                    source: (string) @import-path) @import
                
                (export_statement 
                    source: (string) @import-path) @export
            `;
            
            const query = new Query(language, queryString);
            log(`[TreeSitterAnalyzer] Created import query for ${path.basename(sourceFile)}`);

            const matches = query.matches(tree.rootNode);
            log(`[TreeSitterAnalyzer] Found ${matches.length} import/export matches in ${path.basename(sourceFile)}`);

            for (const match of matches) {
                const importPathNode = match.captures.find((c: QueryCapture) => c.name === 'import-path');
                if (!importPathNode) continue;

                // Extract the import path (remove quotes)
                const importPath = this.extractStringLiteral(importPathNode.node.text);

                if (importPath && importPath.startsWith('.')) {
                    // Resolve relative imports
                    const targetPath = this.resolveImportPath(importPath, sourceFile);
                    if (targetPath) {
                        edges.push({
                            data: {
                                id: `import-${sourceFile}-${targetPath}`,
                                source: sourceFile,
                                target: targetPath,
                                edgeType: 'imports'
                            }
                        });
                        log(`  ✓ Resolved (tree-sitter): ${importPath} -> ${path.basename(targetPath)}`);
                    } else {
                        log(`  ✗ Failed to resolve (tree-sitter): ${importPath}`);
                    }
                }
            }

            return edges;
        } catch (error) {
            log(`[TreeSitterAnalyzer] Error parsing imports for ${path.basename(sourceFile)}: ${error}. Falling back to regex.`);
            return this.fallbackExtractImports(content, sourceFile);
        }
    }

    /**
     * Extract symbols (classes, functions, methods, interfaces, types) from code
     * Delegates to resolver system when available, falls back to legacy implementation
     */
    public extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        // Try to use resolver system first
        try {
            const registry = getResolverRegistry();
            const resolver = registry.getResolverForFile(fileId);
            if (resolver) {
                return resolver.extractSymbols(content, fileId);
            }
        } catch (error) {
            log(`[TreeSitterAnalyzer] Error using resolver system: ${error}. Falling back to legacy implementation.`);
        }

        // Fallback to legacy implementation
        const parserInfo = this.getParserForFile(fileId);
        if (!parserInfo) {
            return this.fallbackExtractSymbols(content, fileId);
        }

        try {
            const { parser, language } = parserInfo;
            // Tree-sitter has a default buffer size of 32KB. Files larger than this will fail with
            // "Invalid argument" error. We set bufferSize dynamically to handle larger files.
            const bufferSize = Math.max(500000, content.length * 2); // At least 500KB, or 2x file size
            const tree = parser.parse(content, undefined, { bufferSize });
            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];

            // Determine if this is a TypeScript file or JavaScript file
            const ext = path.extname(fileId).toLowerCase();
            const isTypeScript = ext === '.ts' || ext === '.tsx';
            
            // Create appropriate query based on file type
            // JavaScript uses 'identifier' for class names, TypeScript uses 'type_identifier'
            const Query = Parser.Query;
            let queryString: string;
            
            if (isTypeScript) {
                // TypeScript-specific query (supports interfaces, type aliases, type_identifier)
                queryString = `
                    (class_declaration name: (type_identifier) @class-name) @class
                    
                    (interface_declaration name: (type_identifier) @interface-name) @interface
                    
                    (type_alias_declaration name: (type_identifier) @type-name) @type
                    
                    (function_declaration name: (identifier) @function-name) @function
                    
                    (generator_function_declaration name: (identifier) @function-name) @generator-function
                    
                    (method_definition name: (property_identifier) @method-name) @method
                `;
            } else {
                // JavaScript query (only supports classes and functions, uses 'identifier' for class names)
                queryString = `
                    (class_declaration name: (identifier) @class-name) @class
                    
                    (function_declaration name: (identifier) @function-name) @function
                    
                    (generator_function_declaration name: (identifier) @function-name) @generator-function
                    
                    (method_definition name: (property_identifier) @method-name) @method
                `;
            }
            
            const query = new Query(language, queryString);
            log(`[TreeSitterAnalyzer] Created ${isTypeScript ? 'TypeScript' : 'JavaScript'} symbol query for ${path.basename(fileId)}`);

            const matches = query.matches(tree.rootNode);
            log(`[TreeSitterAnalyzer] Found ${matches.length} symbol matches in ${path.basename(fileId)}`);

            for (const match of matches) {
                // Extract class
                const classNode = match.captures.find((c: QueryCapture) => c.name === 'class');
                const className = match.captures.find((c: QueryCapture) => c.name === 'class-name');
                if (classNode && className) {
                    const name = className.node.text;
                    const nodeId = `${fileId}-class-${name}`;
                    nodes.push({
                        data: {
                            id: nodeId,
                            label: name,
                            type: 'class',
                            category: 'class',
                            parent: fileId,
                            sizeMultiplier: 1.5,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                // Extract interface
                const interfaceNode = match.captures.find((c: QueryCapture) => c.name === 'interface');
                const interfaceName = match.captures.find((c: QueryCapture) => c.name === 'interface-name');
                if (interfaceNode && interfaceName) {
                    const name = interfaceName.node.text;
                    const nodeId = `${fileId}-interface-${name}`;
                    nodes.push({
                        data: {
                            id: nodeId,
                            label: name,
                            type: 'class', // Treat interfaces similar to classes
                            category: 'class',
                            parent: fileId,
                            sizeMultiplier: 1.5,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                // Extract type alias
                const typeNode = match.captures.find((c: QueryCapture) => c.name === 'type');
                const typeName = match.captures.find((c: QueryCapture) => c.name === 'type-name');
                if (typeNode && typeName) {
                    const name = typeName.node.text;
                    const nodeId = `${fileId}-type-${name}`;
                    nodes.push({
                        data: {
                            id: nodeId,
                            label: name,
                            type: 'class',
                            category: 'class',
                            parent: fileId,
                            sizeMultiplier: 1.2,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                // Extract top-level functions (not methods inside classes)
                const functionNode = match.captures.find((c: QueryCapture) => 
                    c.name === 'function' || c.name === 'generator-function'
                );
                const functionName = match.captures.find((c: QueryCapture) => c.name === 'function-name');
                if (functionNode && functionName) {
                    // Check if this is a top-level function (not inside a class)
                    let isTopLevel = true;
                    let parent = functionNode.node.parent;
                    while (parent) {
                        if (parent.type === 'class_declaration' || 
                            parent.type === 'method_definition' ||
                            parent.type === 'class_body') {
                            isTopLevel = false;
                            break;
                        }
                        parent = parent.parent;
                    }

                    if (isTopLevel) {
                        const name = functionName.node.text;
                        const nodeId = `${fileId}-function-${name}`;
                        nodes.push({
                            data: {
                                id: nodeId,
                                label: name,
                                type: 'function',
                                category: 'function',
                                parent: fileId,
                                sizeMultiplier: 1.0,
                                isCompound: false,
                            }
                        });
                    }
                    continue;
                }
            }

            return { nodes, edges };
        } catch (error) {
            log(`[TreeSitterAnalyzer] Error parsing symbols for ${fileId}: ${error}. Falling back to regex.`);
            return this.fallbackExtractSymbols(content, fileId);
        }
    }

    /**
     * Extract string literal value from AST node text
     * Handles both single and double quotes, and template literals
     */
    private extractStringLiteral(text: string): string {
        // Remove quotes from start and end
        const trimmed = text.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }
        if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    /**
     * Resolve import path to absolute file path
     */
    private resolveImportPath(importPath: string, sourceFile: string): string | null {
        const targetPath = path.resolve(path.dirname(sourceFile), importPath);
        
        // Try common extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', ''];
        for (const ext of extensions) {
            const candidate = targetPath + ext;
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        // If it's a directory, try index files
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
            for (const indexFile of indexFiles) {
                const candidate = path.join(targetPath, indexFile);
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        }

        return null;
    }

    /**
     * Fallback to regex-based import extraction (original implementation)
     */
    private fallbackExtractImports(content: string, sourceFile: string): GraphEdge[] {
        const edges: GraphEdge[] = [];
        const importRegex = /(?:import|export)\s+.*?from\s+['"](.+?)['"]/g;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            
            if (importPath.startsWith('.')) {
                const targetPath = this.resolveImportPath(importPath, sourceFile);
                if (targetPath) {
                    edges.push({
                        data: {
                            id: `import-${sourceFile}-${targetPath}`,
                            source: sourceFile,
                            target: targetPath,
                            edgeType: 'imports'
                        }
                    });
                    log(`  ✓ Resolved (regex fallback): ${importPath} -> ${path.basename(targetPath)}`);
                } else {
                    log(`  ✗ Failed to resolve (regex fallback): ${importPath}`);
                }
            }
        }
        return edges;
    }

    /**
     * Fallback to regex-based symbol extraction (original implementation)
     */
    private fallbackExtractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // Extract classes
        const classRegex = /class\s+(\w+)/g;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const nodeId = `${fileId}-class-${className}`;
            nodes.push({
                data: {
                    id: nodeId,
                    label: className,
                    type: 'class',
                    category: 'class',
                    parent: fileId,
                    sizeMultiplier: 1.5,
                    isCompound: false,
                }
            });
        }
        
        // Extract top-level functions
        const functionRegex = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
        while ((match = functionRegex.exec(content)) !== null) {
            const functionName = match[1];
            const nodeId = `${fileId}-function-${functionName}`;
            nodes.push({
                data: {
                    id: nodeId,
                    label: functionName,
                    type: 'function',
                    category: 'function',
                    parent: fileId,
                    sizeMultiplier: 1.0,
                    isCompound: false,
                }
            });
        }
        
        return { nodes, edges };
    }
}

