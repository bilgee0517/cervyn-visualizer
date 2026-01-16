/**
 * Python language resolver
 * 
 * Handles Python (.py) files
 * Uses tree-sitter-python for accurate AST parsing
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BaseLanguageResolver } from './BaseLanguageResolver';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';
import { TreeSitterError, ParsingError } from '../../errors';
import { handleError } from '../../utils/error-handler';

// Import Python parser
let Python: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Python = require('tree-sitter-python');
} catch (e) {
    log('[PythonResolver] tree-sitter-python not available');
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

export class PythonResolver extends BaseLanguageResolver implements LanguageResolver {
    private pythonParser: Parser;
    private pythonLanguage: any;
    private initialized: boolean = false;

    constructor() {
        super('python', ['.py'], 'Python');
        this.pythonParser = new Parser();
    }

    public async initialize(rootPath: string): Promise<void> {
        await super.initialize(rootPath);
        
        try {
            log('[PythonResolver] Starting initialization...');
            
            if (!Python) {
                log('[PythonResolver] ✗ Python parser module not available');
                this.initialized = false;
                return;
            }

            this.pythonLanguage = Python;
            this.pythonParser.setLanguage(Python);
            log('[PythonResolver] Python parser configured');
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(Python, '(import_statement (dotted_as_names) @import)');
                log(`[PythonResolver] Query test successful`);
            } catch (queryError) {
                log(`[PythonResolver] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[PythonResolver] ✓ Initialized successfully');
        } catch (error) {
            log(`[PythonResolver] ✗ Initialization failed: ${error}`);
            this.initialized = false;
        }
    }

    public getParserForFile(filePath: string): ParserInfo | null {
        if (!this.initialized || !Python) {
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.py') {
            return { parser: this.pythonParser, language: this.pythonLanguage };
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

            // Python tree-sitter queries for imports
            const Query = Parser.Query;
            const queryString = `
                (import_statement 
                    (dotted_as_names (dotted_as_name name: (dotted_name) @import-name))
                    (dotted_name) @import-name)
                
                (import_from_statement 
                    module_name: (dotted_name) @import-path
                    (import_as_names (import_as_name name: (dotted_name) @import-name)))
                
                (import_from_statement 
                    module_name: (relative_import (dot)+ @relative)
                    (import_as_names (import_as_name name: (dotted_name) @import-name)))
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const importPathNode = match.captures.find((c: QueryCapture) => c.name === 'import-path');
                const relativeNode = match.captures.find((c: QueryCapture) => c.name === 'relative');
                
                if (importPathNode) {
                    const importPath = importPathNode.node.text;
                    imports.push({
                        importPath,
                        importType: 'package',
                        lineNumber: importPathNode.node.startPosition.row + 1,
                    });
                } else if (relativeNode) {
                    // Relative import (e.g., from .. import module)
                    const dots = relativeNode.node.text;
                    imports.push({
                        importPath: dots,
                        importType: 'relative',
                        lineNumber: relativeNode.node.startPosition.row + 1,
                    });
                }
            }

            return imports;
        } catch (error) {
            log(`[PythonResolver] Error parsing imports for ${path.basename(sourceFile)}: ${error}. Falling back to regex.`);
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

            // Python tree-sitter query for classes and functions
            const Query = Parser.Query;
            const queryString = `
                (class_definition name: (identifier) @class-name) @class
                
                (function_definition name: (identifier) @function-name) @function
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

                const functionNode = match.captures.find((c: QueryCapture) => c.name === 'function');
                const functionName = match.captures.find((c: QueryCapture) => c.name === 'function-name');
                
                if (functionNode && functionName) {
                    // Check if top-level function (not inside a class)
                    let isTopLevel = true;
                    let parent = functionNode.node.parent;
                    while (parent) {
                        if (parent.type === 'class_definition') {
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
                }
            }

            return { nodes, edges };
        } catch (error) {
            log(`[PythonResolver] Error parsing symbols for ${fileId}: ${error}`);
            return { nodes: [], edges: [] };
        }
    }

    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Handle relative imports (e.g., from ..module import x)
        if (importPath.startsWith('.') || importPath.startsWith('..')) {
            // Convert relative import to file path
            const sourceDir = path.dirname(sourceFile);
            const parts = importPath.split('.');
            
            // Count dots to determine relative depth
            let depth = 0;
            let moduleName = '';
            for (const part of parts) {
                if (part === '') {
                    depth++;
                } else {
                    moduleName = part;
                    break;
                }
            }
            
            if (depth > 0) {
                // Navigate up directories
                let targetDir = sourceDir;
                for (let i = 0; i < depth - 1; i++) {
                    targetDir = path.dirname(targetDir);
                }
                
                // Try to find __init__.py or module.py
                const candidates = [
                    path.join(targetDir, moduleName + '.py'),
                    path.join(targetDir, moduleName, '__init__.py'),
                ];
                
                for (const candidate of candidates) {
                    if (fs.existsSync(candidate)) {
                        return candidate;
                    }
                }
            }
            
            // Fallback to default relative resolution
            return super.resolveImportPath(importPath, sourceFile, rootPath);
        }

        // Handle package imports (e.g., from os import path)
        // Try to resolve via Python path (simplified - in real Python, this uses sys.path)
        const parts = importPath.split('.');
        const moduleName = parts[0];
        
        // Check if it's a standard library module (simplified check)
        const stdlibModules = ['os', 'sys', 'json', 'pathlib', 'datetime', 'collections', 'itertools', 'functools'];
        if (stdlibModules.includes(moduleName)) {
            // Standard library - don't resolve (it's external)
            return null;
        }
        
        // Try to find local module
        // Check if it's a package (has __init__.py)
        const candidates = [
            path.join(rootPath, moduleName + '.py'),
            path.join(rootPath, moduleName, '__init__.py'),
            path.join(rootPath, 'src', moduleName + '.py'),
            path.join(rootPath, 'src', moduleName, '__init__.py'),
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

        log(`[PythonResolver] Searching for entry points in: ${rootPath}`);

        // 1. Check for main.py or __main__.py
        const mainFiles = ['main.py', '__main__.py', 'app.py', 'run.py'];
        for (const mainFile of mainFiles) {
            const fullPath = path.join(rootPath, mainFile);
            if (fs.existsSync(fullPath)) {
                found.push(fullPath);
                log(`[PythonResolver] Found entry point: ${mainFile}`);
            }
        }

        // 2. Check for setup.py entry points
        const setupPy = path.join(rootPath, 'setup.py');
        if (fs.existsSync(setupPy)) {
            try {
                const content = fs.readFileSync(setupPy, 'utf-8');
                // Simple regex to find entry points (can be improved)
                const entryPointMatch = content.match(/entry_points\s*=\s*\{[^}]*'console_scripts'\s*:\s*\[([^\]]+)\]/);
                if (entryPointMatch) {
                    const scripts = entryPointMatch[1];
                    const scriptMatch = scripts.match(/(['"])([^'"]+)\1\s*=\s*([^:,\]]+)/);
                    if (scriptMatch) {
                        const modulePath = scriptMatch[3].trim().replace(/['"]/g, '');
                        const resolvedPath = this.resolvePythonModulePath(modulePath, rootPath);
                        if (resolvedPath) {
                            found.push(resolvedPath);
                            log(`[PythonResolver] Found entry point from setup.py: ${modulePath}`);
                        }
                    }
                }
            } catch (err) {
                const error = new ParsingError(
                    'Could not parse setup.py',
                    setupPy,
                    undefined,
                    undefined,
                    { operation: 'getEntryPoints' },
                    err instanceof Error ? err : undefined
                );
                handleError(error, {
                    operation: 'parse setup.py',
                    component: 'PythonResolver',
                    metadata: { filePath: setupPy }
                });
            }
        }

        // 3. Check pyproject.toml
        const pyprojectToml = path.join(rootPath, 'pyproject.toml');
        if (fs.existsSync(pyprojectToml)) {
            try {
                const content = fs.readFileSync(pyprojectToml, 'utf-8');
                // Simple regex (for full support, use a TOML parser)
                const scriptMatch = content.match(/\[project\.scripts\]\s*\n([^\]]+)/);
                if (scriptMatch) {
                    const moduleMatch = scriptMatch[1].match(/=\s*"([^"]+)"/);
                    if (moduleMatch) {
                        const modulePath = moduleMatch[1];
                        const resolvedPath = this.resolvePythonModulePath(modulePath, rootPath);
                        if (resolvedPath) {
                            found.push(resolvedPath);
                            log(`[PythonResolver] Found entry point from pyproject.toml: ${modulePath}`);
                        }
                    }
                }
            } catch (err) {
                const error = new ParsingError(
                    'Could not parse pyproject.toml',
                    pyprojectToml,
                    undefined,
                    undefined,
                    { operation: 'getEntryPoints' },
                    err instanceof Error ? err : undefined
                );
                handleError(error, {
                    operation: 'parse pyproject.toml',
                    component: 'PythonResolver',
                    metadata: { pyprojectPath: pyprojectToml }
                });
            }
        }

        // 4. Fallback: common entry point patterns
        if (found.length === 0) {
            const commonEntryPoints = await super.findEntryPoints(rootPath);
            found.push(...commonEntryPoints);
        }

        return found;
    }

    public isTestFile(filePath: string): boolean {
        // Python test file patterns
        const fileName = path.basename(filePath).toLowerCase();
        return fileName.startsWith('test_') || 
               fileName.endsWith('_test.py') ||
               super.isTestFile(filePath);
    }

    public shouldAnalyzeFile(filePath: string): boolean {
        if (!super.shouldAnalyzeFile(filePath)) {
            return false;
        }

        // Python-specific: ignore __pycache__ and .pyc files
        if (filePath.includes('__pycache__') || filePath.endsWith('.pyc')) {
            return false;
        }

        return true;
    }

    public dispose(): void {
        super.dispose();
        this.initialized = false;
        this.pythonLanguage = null;
    }

    // Helper methods

    private resolvePythonModulePath(modulePath: string, rootPath: string): string | null {
        // Convert Python module path (e.g., 'package.module:main') to file path
        const [module, func] = modulePath.split(':');
        const parts = module.split('.');
        const moduleFile = parts[parts.length - 1] + '.py';
        
        if (parts.length > 1) {
            const packagePath = parts.slice(0, -1).join(path.sep);
            return path.join(rootPath, packagePath, moduleFile);
        }
        
        return path.join(rootPath, moduleFile);
    }

    private fallbackExtractImports(content: string, sourceFile: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        // Python import patterns
        const importRegex = /(?:^|from\s+)([\w.]+)\s+import|^import\s+([\w.]+)/gm;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1] || match[2];
            if (importPath) {
                imports.push({
                    importPath,
                    importType: importPath.startsWith('.') ? 'relative' : 'package',
                });
            }
        }
        
        return imports;
    }
}


