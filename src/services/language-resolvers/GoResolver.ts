/**
 * Go language resolver
 * 
 * Handles Go (.go) files
 * Uses tree-sitter-go for accurate AST parsing
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BaseLanguageResolver } from './BaseLanguageResolver';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';

// Import Go parser
let Go: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Go = require('tree-sitter-go');
} catch (e) {
    log('[GoResolver] tree-sitter-go not available');
}

interface QueryCapture {
    name: string;
    node: {
        text: string;
        type: string;
        parent: any;
        startPosition: { row: number; column: number };
    };
}

export class GoResolver extends BaseLanguageResolver implements LanguageResolver {
    private goParser: Parser;
    private goLanguage: any;
    private initialized: boolean = false;
    private modulePath: string | null = null;

    constructor() {
        super('go', ['.go'], 'Go');
        this.goParser = new Parser();
    }

    public async initialize(rootPath: string): Promise<void> {
        await super.initialize(rootPath);
        
        try {
            log('[GoResolver] Starting initialization...');
            
            if (!Go) {
                log('[GoResolver] ✗ Go parser module not available');
                this.initialized = false;
                return;
            }

            this.goLanguage = Go;
            this.goParser.setLanguage(Go);
            log('[GoResolver] Go parser configured');
            
            // Try to read go.mod to get module path
            const goModPath = path.join(rootPath, 'go.mod');
            if (fs.existsSync(goModPath)) {
                try {
                    const content = fs.readFileSync(goModPath, 'utf-8');
                    const moduleMatch = content.match(/^module\s+(\S+)/m);
                    if (moduleMatch) {
                        this.modulePath = moduleMatch[1];
                        log(`[GoResolver] Found module path: ${this.modulePath}`);
                    }
                } catch (e) {
                    log(`[GoResolver] Could not read go.mod: ${e}`);
                }
            }
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(Go, '(import_declaration (import_spec_list (import_spec path: (interpreted_string_literal) @path)))');
                log(`[GoResolver] Query test successful`);
            } catch (queryError) {
                log(`[GoResolver] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[GoResolver] ✓ Initialized successfully');
        } catch (error) {
            log(`[GoResolver] ✗ Initialization failed: ${error}`);
            this.initialized = false;
        }
    }

    public getParserForFile(filePath: string): ParserInfo | null {
        if (!this.initialized || !Go) {
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.go') {
            return { parser: this.goParser, language: this.goLanguage };
        }
        
        return null;
    }

    public extractImports(content: string, sourceFile: string): ImportInfo[] {
        const parserInfo = this.getParserForFile(sourceFile);
        if (!parserInfo) {
            return this.fallbackExtractImports(content, sourceFile);
        }

        try {
            const { parser, language } = parserInfo;
            const tree = parser.parse(content);
            const imports: ImportInfo[] = [];

            // Go tree-sitter query for imports
            const Query = Parser.Query;
            const queryString = `
                (import_declaration 
                    (import_spec_list 
                        (import_spec 
                            path: (interpreted_string_literal) @import-path))) @import
                
                (import_declaration 
                    (import_spec_list 
                        (import_spec 
                            path: (raw_string_literal) @import-path))) @import-raw
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const importPathNode = match.captures.find((c: QueryCapture) => c.name === 'import-path');
                if (!importPathNode) continue;

                // Extract the import path (remove quotes)
                const importPath = this.extractStringLiteral(importPathNode.node.text);
                if (!importPath) continue;

                // Determine import type
                let importType: 'relative' | 'absolute' | 'package' | 'alias' = 'package';
                if (importPath.startsWith('.')) {
                    importType = 'relative';
                } else if (!importPath.includes('/') || importPath.startsWith('internal/')) {
                    // Standard library or internal package
                    importType = 'package';
                } else {
                    // External package or module path
                    importType = 'package';
                }

                imports.push({
                    importPath,
                    importType,
                    lineNumber: importPathNode.node.startPosition.row + 1,
                });
            }

            return imports;
        } catch (error) {
            log(`[GoResolver] Error parsing imports for ${path.basename(sourceFile)}: ${error}. Falling back to regex.`);
            return this.fallbackExtractImports(content, sourceFile);
        }
    }

    public extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        const parserInfo = this.getParserForFile(fileId);
        if (!parserInfo) {
            return { nodes: [], edges: [] };
        }

        try {
            const { parser, language } = parserInfo;
            const tree = parser.parse(content);
            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];

            // Go tree-sitter query for types and functions
            const Query = Parser.Query;
            const queryString = `
                (type_declaration 
                    (type_spec name: (type_identifier) @type-name)) @type
                
                (function_declaration name: (identifier) @function-name) @function
                
                (method_declaration name: (field_identifier) @method-name) @method
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
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
                            sizeMultiplier: 1.5,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                const functionNode = match.captures.find((c: QueryCapture) => c.name === 'function');
                const functionName = match.captures.find((c: QueryCapture) => c.name === 'function-name');
                
                if (functionNode && functionName) {
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
                    continue;
                }

                const methodNode = match.captures.find((c: QueryCapture) => c.name === 'method');
                const methodName = match.captures.find((c: QueryCapture) => c.name === 'method-name');
                
                if (methodNode && methodName) {
                    const name = methodName.node.text;
                    const nodeId = `${fileId}-method-${name}`;
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
            }

            return { nodes, edges };
        } catch (error) {
            log(`[GoResolver] Error parsing symbols for ${fileId}: ${error}`);
            return { nodes: [], edges: [] };
        }
    }

    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Handle relative imports (not common in Go, but possible with "internal" packages)
        if (importPath.startsWith('.')) {
            return super.resolveImportPath(importPath, sourceFile, rootPath);
        }

        // Handle module imports
        if (this.modulePath && importPath.startsWith(this.modulePath)) {
            // Local module import
            const relativePath = importPath.substring(this.modulePath.length + 1);
            const candidates = [
                path.join(rootPath, relativePath + '.go'),
                path.join(rootPath, relativePath, relativePath.split('/').pop() + '.go'),
            ];
            
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        } else if (!importPath.includes('/') || importPath.startsWith('internal/')) {
            // Standard library or internal package - try to resolve locally
            const candidates = [
                path.join(rootPath, importPath + '.go'),
                path.join(rootPath, 'internal', importPath + '.go'),
            ];
            
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        }

        // External package - don't resolve (it's in GOPATH/module cache)
        return null;
    }

    public async findEntryPoints(rootPath: string): Promise<string[]> {
        const found: string[] = [];

        log(`[GoResolver] Searching for entry points in: ${rootPath}`);

        // Go entry points: main.go files with package main
        const mainFiles = await vscode.workspace.findFiles(
            '**/main.go',
            '**/{vendor,node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache}/**'
        );

        for (const uri of mainFiles) {
            try {
                const content = fs.readFileSync(uri.fsPath, 'utf-8');
                // Check if it's package main
                if (content.match(/^package\s+main\b/m)) {
                    found.push(uri.fsPath);
                    log(`[GoResolver] Found entry point: ${path.relative(rootPath, uri.fsPath)}`);
                }
            } catch (e) {
                log(`[GoResolver] Could not read ${uri.fsPath}: ${e}`);
            }
        }

        // Also check cmd/ directory (common Go project structure)
        const cmdDir = path.join(rootPath, 'cmd');
        if (fs.existsSync(cmdDir) && fs.statSync(cmdDir).isDirectory()) {
            const cmdEntries = fs.readdirSync(cmdDir, { withFileTypes: true });
            for (const entry of cmdEntries) {
                if (entry.isDirectory() && !this.isExcludedDirectory(entry.name)) {
                    const mainGo = path.join(cmdDir, entry.name, 'main.go');
                    if (fs.existsSync(mainGo)) {
                        found.push(mainGo);
                        log(`[GoResolver] Found entry point in cmd/: ${entry.name}/main.go`);
                    }
                }
            }
        }

        return found;
    }

    public isTestFile(filePath: string): boolean {
        // Go test file pattern: *_test.go
        return filePath.endsWith('_test.go') || super.isTestFile(filePath);
    }

    public shouldAnalyzeFile(filePath: string): boolean {
        if (!super.shouldAnalyzeFile(filePath)) {
            return false;
        }

        // Go-specific: ignore vendor directory
        if (filePath.includes('/vendor/')) {
            return false;
        }

        return true;
    }

    public dispose(): void {
        super.dispose();
        this.initialized = false;
        this.goLanguage = null;
        this.modulePath = null;
    }

    // Helper methods

    private extractStringLiteral(text: string): string {
        const trimmed = text.trim();
        // Remove quotes (Go uses double quotes or backticks)
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    private fallbackExtractImports(content: string, sourceFile: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        // Go import patterns
        const importRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)"|`([^`]+)`)/gs;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            if (match[1]) {
                // Multi-line import block
                const blockContent = match[1];
                const singleImportRegex = /"([^"]+)"|`([^`]+)`/g;
                let singleMatch;
                while ((singleMatch = singleImportRegex.exec(blockContent)) !== null) {
                    imports.push({
                        importPath: singleMatch[1] || singleMatch[2],
                        importType: 'package',
                    });
                }
            } else {
                // Single import
                imports.push({
                    importPath: match[2] || match[3],
                    importType: 'package',
                });
            }
        }
        
        return imports;
    }
}


