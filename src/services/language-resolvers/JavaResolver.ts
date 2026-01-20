/**
 * Java language resolver
 * 
 * Handles Java (.java) files
 * Uses tree-sitter-java for accurate AST parsing
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BaseLanguageResolver } from './BaseLanguageResolver';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';
import { TreeSitterError, FileSystemError } from '../../errors';
import { handleError } from '../../utils/error-handler';

// Import Java parser
let Java: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Java = require('tree-sitter-java');
} catch (e) {
    log('[JavaResolver] tree-sitter-java not available');
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

export class JavaResolver extends BaseLanguageResolver implements LanguageResolver {
    private javaParser: Parser;
    private javaLanguage: any;
    private initialized: boolean = false;

    constructor() {
        super('java', ['.java'], 'Java');
        this.javaParser = new Parser();
    }

    public async initialize(rootPath: string): Promise<void> {
        await super.initialize(rootPath);
        
        try {
            log('[JavaResolver] Starting initialization...');
            
            if (!Java) {
                log('[JavaResolver] ✗ Java parser module not available');
                this.initialized = false;
                return;
            }

            this.javaLanguage = Java;
            this.javaParser.setLanguage(Java);
            log('[JavaResolver] Java parser configured');
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(Java, '(import_declaration (scoped_identifier) @import)');
                log(`[JavaResolver] Query test successful`);
            } catch (queryError) {
                log(`[JavaResolver] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[JavaResolver] ✓ Initialized successfully');
        } catch (error) {
            log(`[JavaResolver] ✗ Initialization failed: ${error}`);
            this.initialized = false;
        }
    }

    public getParserForFile(filePath: string): ParserInfo | null {
        if (!this.initialized || !Java) {
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.java') {
            return { parser: this.javaParser, language: this.javaLanguage };
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

            // Java tree-sitter query for imports
            const Query = Parser.Query;
            const queryString = `
                (import_declaration 
                    (scoped_identifier) @import-path) @import
                
                (import_declaration 
                    (asterisk) @wildcard
                    (scoped_identifier) @import-path) @import-wildcard
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const importPathNode = match.captures.find((c: QueryCapture) => c.name === 'import-path');
                if (!importPathNode) continue;

                const importPath = importPathNode.node.text;
                // Determine import type
                let importType: 'relative' | 'absolute' | 'package' | 'alias' = 'package';
                
                // Check if it's a standard library package
                if (importPath.startsWith('java.') || importPath.startsWith('javax.')) {
                    importType = 'package';
                } else {
                    // Could be local package
                    importType = 'package';
                }

                imports.push({
                    importPath,
                    importType,
                    lineNumber: importPathNode.node.startPosition.row + 1,
                });
            }

            return imports;
        } catch (err) {
            const error = new TreeSitterError(
                'Failed to parse Java imports',
                'java',
                'imports',
                { sourceFile: path.basename(sourceFile) },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'extract java imports',
                component: 'JavaResolver',
                metadata: { sourceFile: path.basename(sourceFile), usingFallback: true }
            });
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

            // Java tree-sitter query for classes, interfaces, and methods
            const Query = Parser.Query;
            const queryString = `
                (class_declaration name: (identifier) @class-name) @class
                
                (interface_declaration name: (identifier) @interface-name) @interface
                
                (enum_declaration name: (identifier) @enum-name) @enum
                
                (method_declaration name: (identifier) @method-name) @method
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
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

                const interfaceNode = match.captures.find((c: QueryCapture) => c.name === 'interface');
                const interfaceName = match.captures.find((c: QueryCapture) => c.name === 'interface-name');
                
                if (interfaceNode && interfaceName) {
                    const name = interfaceName.node.text;
                    const nodeId = `${fileId}-interface-${name}`;
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

                const enumNode = match.captures.find((c: QueryCapture) => c.name === 'enum');
                const enumName = match.captures.find((c: QueryCapture) => c.name === 'enum-name');
                
                if (enumNode && enumName) {
                    const name = enumName.node.text;
                    const nodeId = `${fileId}-enum-${name}`;
                    nodes.push({
                        data: {
                            id: nodeId,
                            label: name,
                            type: 'class',
                            category: 'class',
                            parent: fileId,
                            sizeMultiplier: 1.3,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                const methodNode = match.captures.find((c: QueryCapture) => c.name === 'method');
                const methodName = match.captures.find((c: QueryCapture) => c.name === 'method-name');
                
                if (methodNode && methodName) {
                    // Check if it's a top-level method (not inside a class - unlikely in Java, but handle it)
                    let isTopLevel = true;
                    let parent = methodNode.node.parent;
                    while (parent) {
                        if (parent.type === 'class_declaration' || parent.type === 'interface_declaration') {
                            isTopLevel = false;
                            break;
                        }
                        parent = parent.parent;
                    }

                    if (isTopLevel) {
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
            }

            return { nodes, edges };
        } catch (err) {
            const error = new TreeSitterError(
                'Failed to parse Java symbols',
                'java',
                'symbols',
                { fileId },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'extract java symbols',
                component: 'JavaResolver',
                metadata: { fileId }
            });
            return { nodes: [], edges: [] };
        }
    }

    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Java uses package structure: convert com.example.Class to com/example/Class.java
        // Check if it's a standard library package
        if (importPath.startsWith('java.') || importPath.startsWith('javax.') || importPath.startsWith('sun.')) {
            // Standard library - don't resolve
            return null;
        }

        // Convert package to file path
        const packageParts = importPath.split('.');
        const className = packageParts.pop() || '';
        const packagePath = packageParts.join(path.sep);

        // Try to find the file in src/main/java or src (common Maven/Gradle structure)
        const candidates = [
            path.join(rootPath, 'src', 'main', 'java', packagePath, className + '.java'),
            path.join(rootPath, 'src', packagePath, className + '.java'),
            path.join(rootPath, packagePath, className + '.java'),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    public async findEntryPoints(rootPath: string): Promise<string[]> {
        const found: string[] = [];

        log(`[JavaResolver] Searching for entry points in: ${rootPath}`);

        // Java entry points: classes with public static void main(String[] args)
        const javaFiles = await vscode.workspace.findFiles(
            '**/*.java',
            '**/{target,node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache,test}/**'
        );

        for (const uri of javaFiles) {
            if (!this.shouldAnalyzeFile(uri.fsPath)) continue;
            
            try {
                const content = fs.readFileSync(uri.fsPath, 'utf-8');
                // Check for main method
                if (content.match(/public\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s+\w+\s*\)/)) {
                    found.push(uri.fsPath);
                    log(`[JavaResolver] Found entry point: ${path.relative(rootPath, uri.fsPath)}`);
                }
            } catch (err) {
                const error = new FileSystemError(
                    'Could not read Java file',
                    uri.fsPath,
                    'read',
                    { operation: 'findEntryPoints' },
                    err instanceof Error ? err : undefined
                );
                handleError(error, {
                    operation: 'find java entry points',
                    component: 'JavaResolver',
                    metadata: { filePath: uri.fsPath }
                });
            }
        }

        // Also check for Spring Boot main class pattern (Application.java)
        const appFiles = await vscode.workspace.findFiles(
            '**/*Application.java',
            '**/{target,node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache}/**'
        );

        for (const uri of appFiles) {
            if (!this.shouldAnalyzeFile(uri.fsPath)) continue;
            if (!found.includes(uri.fsPath)) {
                found.push(uri.fsPath);
                log(`[JavaResolver] Found Spring Boot entry point: ${path.relative(rootPath, uri.fsPath)}`);
            }
        }

        return found;
    }

    public isTestFile(filePath: string): boolean {
        // Java test file patterns: *Test.java, *Tests.java, Test*.java
        const fileName = path.basename(filePath);
        return fileName.includes('Test') || 
               filePath.includes('/test/') ||
               super.isTestFile(filePath);
    }

    public shouldAnalyzeFile(filePath: string): boolean {
        if (!super.shouldAnalyzeFile(filePath)) {
            return false;
        }

        // Java-specific: ignore target directory (Maven/Gradle build output)
        if (filePath.includes('/target/')) {
            return false;
        }

        return true;
    }

    public dispose(): void {
        super.dispose();
        this.initialized = false;
        this.javaLanguage = null;
    }

    // Helper methods

    private fallbackExtractImports(content: string, sourceFile: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        // Java import pattern
        const importRegex = /^import\s+(?:static\s+)?([\w.]+(?:\*)?);/gm;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push({
                importPath: match[1],
                importType: 'package',
            });
        }
        
        return imports;
    }
}


