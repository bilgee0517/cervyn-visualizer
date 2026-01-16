/**
 * TypeScript/JavaScript language resolver
 * 
 * Handles TypeScript (.ts, .tsx) and JavaScript (.js, .jsx, .mjs, .cjs) files
 * Uses tree-sitter for accurate AST parsing
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BaseLanguageResolver } from './BaseLanguageResolver';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';
import { TreeSitterError, FileSystemError, ParsingError } from '../../errors';
import { handleError } from '../../utils/error-handler';

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
    log('[TypeScriptResolver] JavaScript parser not available, will use TypeScript parser for JS files');
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

export class TypeScriptResolver extends BaseLanguageResolver implements LanguageResolver {
    private tsParser: Parser;
    private tsxParser: Parser;
    private jsParser: Parser;
    private tsLanguage: any;
    private tsxLanguage: any;
    private jsLanguage: any;
    private initialized: boolean = false;

    constructor() {
        super('typescript', ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], 'TypeScript/JavaScript');
        
        this.tsParser = new Parser();
        this.tsxParser = new Parser();
        this.jsParser = new Parser();
    }

    public async initialize(rootPath: string): Promise<void> {
        await super.initialize(rootPath);
        
        try {
            log('[TypeScriptResolver] Starting initialization...');
            
            this.tsLanguage = TypeScript;
            this.tsxLanguage = TSX;
            this.tsParser.setLanguage(TypeScript);
            this.tsxParser.setLanguage(TSX);
            log('[TypeScriptResolver] TypeScript and TSX parsers configured');
            
            if (JavaScript) {
                try {
                this.jsLanguage = JavaScript;
                this.jsParser.setLanguage(JavaScript);
                log('[TypeScriptResolver] JavaScript parser configured');
                } catch (jsError) {
                    log(`[TypeScriptResolver] Failed to set JavaScript parser: ${jsError}, using TypeScript fallback`);
                    this.jsLanguage = TypeScript;
                    this.jsParser.setLanguage(TypeScript);
                }
            } else {
                // Fallback to TypeScript parser for JS files
                this.jsLanguage = TypeScript;
                this.jsParser.setLanguage(TypeScript);
                log('[TypeScriptResolver] Using TypeScript parser as fallback for JavaScript files');
            }
            
            // Verify all language objects are set
            if (!this.tsLanguage || !this.tsxLanguage || !this.jsLanguage) {
                throw new Error('Failed to initialize language objects');
            }
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(TypeScript, '(import_statement source: (string) @path)');
                log(`[TypeScriptResolver] Query test successful`);
            } catch (queryError) {
                log(`[TypeScriptResolver] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[TypeScriptResolver] ✓ Initialized successfully');
        } catch (error) {
            log(`[TypeScriptResolver] ✗ Initialization failed: ${error}`);
            log(`[TypeScriptResolver] Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
            this.initialized = false;
        }
    }

    public getParserForFile(filePath: string): ParserInfo | null {
        if (!this.initialized) {
            log(`[TypeScriptResolver] Not initialized, cannot parse ${path.basename(filePath)}`);
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        
        let parser: Parser | null = null;
        let language: any = null;
        
        switch (ext) {
            case '.ts':
                parser = this.tsParser;
                language = this.tsLanguage;
                break;
            case '.tsx':
                parser = this.tsxParser;
                language = this.tsxLanguage;
                break;
            case '.js':
            case '.mjs':
            case '.cjs':
                parser = this.jsParser;
                language = this.jsLanguage;
                break;
            case '.jsx':
                parser = this.jsParser;
                language = this.jsLanguage;
                break;
            default:
                return null;
        }
        
        // Validate parser and language
        if (!parser || !language) {
            log(`[TypeScriptResolver] Parser or language not available for ${ext} files`);
            return null;
        }
        
        return { parser, language };
    }

    public extractImports(content: string, sourceFile: string): ImportInfo[] {
        const parserInfo = this.getParserForFile(sourceFile);
        if (!parserInfo) {
            return this.fallbackExtractImports(content, sourceFile);
        }

        try {
            const { language } = parserInfo;
            
            // Validate content
            if (content === null || content === undefined) {
                log(`[TypeScriptResolver] Content is null/undefined for ${path.basename(sourceFile)}`);
                return this.fallbackExtractImports(content || '', sourceFile);
            }
            
            if (typeof content !== 'string') {
                log(`[TypeScriptResolver] Content is not a string for ${path.basename(sourceFile)}: ${typeof content}`);
                return this.fallbackExtractImports(String(content), sourceFile);
            }
            
            // Validate language object
            if (!language) {
                log(`[TypeScriptResolver] Language object is null for ${path.basename(sourceFile)}`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            // Create a fresh parser instance to avoid state corruption issues
            // Tree-sitter parsers can have issues when reused across multiple files
            const freshParser = new Parser();
            
            // Set language on the fresh parser
            try {
                freshParser.setLanguage(language);
            } catch (setLangError) {
                log(`[TypeScriptResolver] Failed to set language for ${path.basename(sourceFile)}: ${setLangError}`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            // Parse with the fresh parser instance
            let tree: any;
            try {
                // Tree-sitter has a default buffer size of 32KB. Files larger than this will fail with
                // "Invalid argument" error. We set bufferSize to 500KB to handle larger files with margin.
                // The buffer needs to be larger than the file size to account for UTF-8 encoding and internal structures.
                // For very large files (>5MB), performance may degrade, but parsing should still work.
                const bufferSize = Math.max(500000, content.length * 2); // At least 500KB, or 2x file size
                tree = freshParser.parse(content, undefined, { bufferSize });
            } catch (parseError) {
                const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                log(`[TypeScriptResolver] Parser.parse() failed for ${path.basename(sourceFile)}: ${errorMsg}`);
                log(`[TypeScriptResolver] Content length: ${content.length}, Content type: ${typeof content}`);
                if (content.length > 0) {
                    log(`[TypeScriptResolver] Content preview: ${content.substring(0, 100).replace(/\n/g, '\\n')}...`);
                }
                log(`[TypeScriptResolver] Language type: ${typeof language}, Language keys: ${language ? Object.keys(language).slice(0, 5).join(', ') : 'N/A'}`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            if (!tree || !tree.rootNode) {
                log(`[TypeScriptResolver] Failed to parse tree for ${path.basename(sourceFile)}`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            // Check for parse errors
            if (tree.rootNode.hasError) {
                log(`[TypeScriptResolver] Parse errors detected in ${path.basename(sourceFile)}, using fallback`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            const imports: ImportInfo[] = [];

            // Query for import statements
            // Note: In tree-sitter-typescript, we query for import_statement
            // For exports, we'll handle export declarations separately if needed
            const Query = Parser.Query;
            const queryString = `
                (import_statement 
                    source: (string) @import-path) @import
            `;
            
            // Validate language object before creating query
            if (typeof language !== 'object' || language === null) {
                log(`[TypeScriptResolver] Invalid language object for ${path.basename(sourceFile)}: ${typeof language}`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            let query: any;
            try {
                query = new Query(language, queryString);
            } catch (queryError) {
                const queryErrorMsg = queryError instanceof Error ? queryError.message : String(queryError);
                log(`[TypeScriptResolver] Query creation failed for ${path.basename(sourceFile)}: ${queryErrorMsg}`);
                log(`[TypeScriptResolver] Language type: ${typeof language}, Language: ${language?.constructor?.name || 'unknown'}`);
                log(`[TypeScriptResolver] Query string: ${queryString.substring(0, 100)}...`);
                return this.fallbackExtractImports(content, sourceFile);
            }
            
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const importPathNode = match.captures.find((c: QueryCapture) => c.name === 'import-path');
                if (!importPathNode) continue;

                // Extract the import path (remove quotes)
                const importPath = this.extractStringLiteral(importPathNode.node.text);
                if (!importPath) continue;

                // Determine import type
                let importType: 'relative' | 'absolute' | 'package' | 'alias' = 'relative';
                if (importPath.startsWith('.')) {
                    importType = 'relative';
                } else if (importPath.startsWith('/')) {
                    importType = 'absolute';
                } else if (importPath.startsWith('@')) {
                    importType = 'alias';
                } else {
                    importType = 'package';
                }

                imports.push({
                    importPath,
                    importType,
                    lineNumber: importPathNode.node.startPosition.row + 1, // 1-indexed
                });
            }

            return imports;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : 'N/A';
            log(`[TypeScriptResolver] Error parsing imports for ${path.basename(sourceFile)}: ${errorMessage}`);
            log(`[TypeScriptResolver] Stack: ${errorStack}`);
            return this.fallbackExtractImports(content, sourceFile);
        }
    }

    public extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        const parserInfo = this.getParserForFile(fileId);
        if (!parserInfo) {
            return this.fallbackExtractSymbols(content, fileId);
        }

        try {
            const { language } = parserInfo;
            
            // Validate content
            if (content === null || content === undefined) {
                log(`[TypeScriptResolver] Content is null/undefined for ${path.basename(fileId)}`);
                return this.fallbackExtractSymbols(content || '', fileId);
            }
            
            if (typeof content !== 'string') {
                log(`[TypeScriptResolver] Content is not a string for ${path.basename(fileId)}: ${typeof content}`);
                return this.fallbackExtractSymbols(String(content), fileId);
            }
            
            // Validate language object
            if (!language) {
                log(`[TypeScriptResolver] Language object is null for ${path.basename(fileId)}`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            // Create a fresh parser instance to avoid state corruption issues
            // Tree-sitter parsers can have issues when reused across multiple files
            const freshParser = new Parser();
            
            // Set language on the fresh parser
            try {
                freshParser.setLanguage(language);
            } catch (setLangError) {
                log(`[TypeScriptResolver] Failed to set language for ${path.basename(fileId)}: ${setLangError}`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            // Parse with the fresh parser instance
            let tree: any;
            try {
                // Tree-sitter has a default buffer size of 32KB. Files larger than this will fail with
                // "Invalid argument" error. We set bufferSize to 500KB to handle larger files with margin.
                // The buffer needs to be larger than the file size to account for UTF-8 encoding and internal structures.
                // For very large files (>5MB), performance may degrade, but parsing should still work.
                const bufferSize = Math.max(500000, content.length * 2); // At least 500KB, or 2x file size
                tree = freshParser.parse(content, undefined, { bufferSize });
            } catch (parseError) {
                const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                log(`[TypeScriptResolver] Parser.parse() failed for ${path.basename(fileId)}: ${errorMsg}`);
                log(`[TypeScriptResolver] Content length: ${content.length}, Content type: ${typeof content}`);
                if (content.length > 0) {
                    log(`[TypeScriptResolver] Content preview: ${content.substring(0, 100).replace(/\n/g, '\\n')}...`);
                }
                log(`[TypeScriptResolver] Language type: ${typeof language}, Language keys: ${language ? Object.keys(language).slice(0, 5).join(', ') : 'N/A'}`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            if (!tree || !tree.rootNode) {
                log(`[TypeScriptResolver] Failed to parse tree for ${path.basename(fileId)}`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            // Check for parse errors
            if (tree.rootNode.hasError) {
                log(`[TypeScriptResolver] Parse errors detected in ${path.basename(fileId)}, using fallback`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];

            // Determine if this is a TypeScript file or JavaScript file
            const ext = path.extname(fileId).toLowerCase();
            const isTypeScript = ext === '.ts' || ext === '.tsx';
            
            // Create appropriate query based on file type
            const Query = Parser.Query;
            let queryString: string;
            
            if (isTypeScript) {
                // TypeScript-specific query
                queryString = `
                    (class_declaration name: (type_identifier) @class-name) @class
                    
                    (interface_declaration name: (type_identifier) @interface-name) @interface
                    
                    (type_alias_declaration name: (type_identifier) @type-name) @type
                    
                    (function_declaration name: (identifier) @function-name) @function
                    
                    (generator_function_declaration name: (identifier) @function-name) @generator-function
                    
                    (method_definition name: (property_identifier) @method-name) @method
                `;
            } else {
                // JavaScript query
                queryString = `
                    (class_declaration name: (identifier) @class-name) @class
                    
                    (function_declaration name: (identifier) @function-name) @function
                    
                    (generator_function_declaration name: (identifier) @function-name) @generator-function
                    
                    (method_definition name: (property_identifier) @method-name) @method
                `;
            }
            
            // Validate language object before creating query
            if (typeof language !== 'object' || language === null) {
                log(`[TypeScriptResolver] Invalid language object for ${path.basename(fileId)}: ${typeof language}`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            let query: any;
            try {
                query = new Query(language, queryString);
            } catch (queryError) {
                const queryErrorMsg = queryError instanceof Error ? queryError.message : String(queryError);
                log(`[TypeScriptResolver] Query creation failed for ${path.basename(fileId)}: ${queryErrorMsg}`);
                log(`[TypeScriptResolver] Language type: ${typeof language}, Language: ${language?.constructor?.name || 'unknown'}`);
                log(`[TypeScriptResolver] Query string: ${queryString.substring(0, 200)}...`);
                return this.fallbackExtractSymbols(content, fileId);
            }
            
            const matches = query.matches(tree.rootNode);
            log(`[TypeScriptResolver] Found ${matches.length} symbol matches in ${path.basename(fileId)}`);

            for (const match of matches) {
                // Extract class
                const classNode = match.captures.find((c: QueryCapture) => c.name === 'class');
                const className = match.captures.find((c: QueryCapture) => c.name === 'class-name');
                if (classNode && className) {
                    const name = className.node.text;
                    const nodeId = `${fileId}-class-${name}`;
                    log(`[TypeScriptResolver] ✓ Extracting CLASS: ${name} (nodeId: ${nodeId})`);
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
                    log(`[TypeScriptResolver] ✓ Extracting INTERFACE: ${name} (nodeId: ${nodeId})`);
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

                // Extract type alias
                const typeNode = match.captures.find((c: QueryCapture) => c.name === 'type');
                const typeName = match.captures.find((c: QueryCapture) => c.name === 'type-name');
                if (typeNode && typeName) {
                    const name = typeName.node.text;
                    const nodeId = `${fileId}-type-${name}`;
                    log(`[TypeScriptResolver] ✓ Extracting TYPE ALIAS: ${name} (nodeId: ${nodeId})`);
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
                    const parentTypes: string[] = [];
                    while (parent) {
                        parentTypes.push(parent.type);
                        if (parent.type === 'class_declaration' || 
                            parent.type === 'method_definition' ||
                            parent.type === 'class_body') {
                            isTopLevel = false;
                            break;
                        }
                        parent = parent.parent;
                    }

                    const name = functionName.node.text;
                    if (isTopLevel) {
                        const nodeId = `${fileId}-function-${name}`;
                        log(`[TypeScriptResolver] ✓ Extracting TOP-LEVEL FUNCTION: ${name} (nodeId: ${nodeId})`);
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
                    } else {
                        log(`[TypeScriptResolver] ⏭️  Skipping function ${name} - not top-level (parent types: ${parentTypes.join(' -> ')})`);
                    }
                    continue;
                }
                
                // Check for method_definition (should be skipped, but log for debugging)
                const methodNode = match.captures.find((c: QueryCapture) => c.name === 'method');
                const methodName = match.captures.find((c: QueryCapture) => c.name === 'method-name');
                if (methodNode && methodName) {
                    const name = methodName.node.text;
                    log(`[TypeScriptResolver] ⏭️  Skipping METHOD: ${name} (methods inside classes are not extracted)`);
                    continue;
                }
            }

            log(`[TypeScriptResolver] ✓ Symbol extraction complete: ${nodes.length} symbols extracted from ${path.basename(fileId)}`);
            if (nodes.length > 0) {
                log(`[TypeScriptResolver]   Symbols: ${nodes.map(n => `${n.data.type}:${n.data.label}`).join(', ')}`);
            }

            return { nodes, edges };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : 'N/A';
            log(`[TypeScriptResolver] Error parsing symbols for ${path.basename(fileId)}: ${errorMessage}`);
            log(`[TypeScriptResolver] Stack: ${errorStack}`);
            return this.fallbackExtractSymbols(content, fileId);
        }
    }

    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Handle relative imports (default behavior)
        if (importPath.startsWith('.')) {
            return super.resolveImportPath(importPath, sourceFile, rootPath);
        }

        // TODO: Handle path aliases from tsconfig.json (e.g., '@app/components')
        // TODO: Handle package.json exports field
        // TODO: Handle node_modules resolution
        
        // For now, return null for non-relative imports
        // This will be enhanced with TypeScript compiler API integration
        return null;
    }

    public async findEntryPoints(rootPath: string): Promise<string[]> {
        const found: string[] = [];

        log(`[TypeScriptResolver] Searching for entry points in: ${rootPath}`);

        // 1. Check if root has package.json
        const rootPackageJson = path.join(rootPath, 'package.json');
        if (fs.existsSync(rootPackageJson)) {
            log(`[TypeScriptResolver] Found package.json at root`);
            const entryPoint = await this.findEntryPointFromPackageJson(rootPath);
            if (entryPoint) {
                found.push(entryPoint);
            }
        }

        // 2. Check for subdirectories that are separate projects
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            const subdirs = entries.filter(e => e.isDirectory() && !this.isExcludedDirectory(e.name));
            
            for (const subdir of subdirs) {
                const subdirPath = path.join(rootPath, subdir.name);
                const subdirPackageJson = path.join(subdirPath, 'package.json');
                
                if (fs.existsSync(subdirPackageJson)) {
                    log(`[TypeScriptResolver] Found project in subdirectory: ${subdir.name}`);
                    const entryPoint = await this.findEntryPointFromPackageJson(subdirPath);
                    if (entryPoint) {
                        found.push(entryPoint);
                    }
                }
            }
        } catch (err) {
            const error = new FileSystemError(
                'Could not scan subdirectories',
                rootPath,
                'read',
                { operation: 'findProjectRoots' },
                err instanceof Error ? err : undefined
            );
            handleError(error, {
                operation: 'find project roots',
                component: 'TypeScriptResolver',
                metadata: { rootPath }
            });
        }

        // 3. Fallback: Look for common entry points
        if (found.length === 0) {
            log(`[TypeScriptResolver] No package.json-based entry points found, trying common patterns...`);
            const commonEntryPoints = await super.findEntryPoints(rootPath);
            found.push(...commonEntryPoints);
        }

        // 4. Last resort: Find any index files
        if (found.length === 0) {
            log(`[TypeScriptResolver] No common entry points found, searching for any index files...`);
            const indices = await vscode.workspace.findFiles(
                '**/index.{ts,js,tsx}',
                '**/{node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache,test}/**'
            );
            indices.forEach(uri => {
                if (this.shouldAnalyzeFile(uri.fsPath)) {
                    found.push(uri.fsPath);
                }
            });
        }

        log(`[TypeScriptResolver] Found ${found.length} entry points`);
        return found.slice(0, 5); // Limit to 5 entry points
    }

    private async findEntryPointFromPackageJson(projectPath: string): Promise<string | null> {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // Check for Theia extension
            if (packageJson.theiaExtensions && Array.isArray(packageJson.theiaExtensions)) {
                log(`[TypeScriptResolver] Detected Theia extension`);
                const theiaEntry = packageJson.theiaExtensions[0];
                if (theiaEntry.frontend) {
                    const sourcePath = theiaEntry.frontend
                        .replace(/^lib\//, 'src/')
                        .replace(/-frontend-module$/, '');
                    
                    const candidates = [
                        `${sourcePath}.ts`,
                        path.join(path.dirname(sourcePath), 'index.ts'),
                        'src/browser/index.ts'
                    ];
                    
                    for (const cand of candidates) {
                        const fullPath = path.join(projectPath, cand);
                        if (fs.existsSync(fullPath)) {
                            log(`[TypeScriptResolver] Entry (Theia): ${cand}`);
                            return fullPath;
                        }
                    }
                }
            }
            
            // Check 'main' field
            if (packageJson.main) {
                const mainPath = packageJson.main;
                const sourcePath = mainPath
                    .replace(/^\.\/out\//, './src/')
                    .replace(/^\.\/dist\//, './src/')
                    .replace(/^\.\/lib\//, './src/')
                    .replace(/\.js$/, '.ts');
                
                const fullPath = path.join(projectPath, sourcePath);
                if (fs.existsSync(fullPath)) {
                    log(`[TypeScriptResolver] Entry from package.json: ${sourcePath}`);
                    return fullPath;
                }
            }

            // Check 'module' field
            if (packageJson.module) {
                const modulePath = path.join(projectPath, packageJson.module);
                if (fs.existsSync(modulePath)) {
                    log(`[TypeScriptResolver] Entry from package.json (module): ${packageJson.module}`);
                    return modulePath;
                }
            }
            
            // Look for common patterns
            const candidates = ['src/index.ts', 'src/main.ts', 'src/extension.ts', 'src/browser/index.ts'];
            for (const cand of candidates) {
                const fullPath = path.join(projectPath, cand);
                if (fs.existsSync(fullPath)) {
                    log(`[TypeScriptResolver] Entry by convention: ${cand}`);
                    return fullPath;
                }
            }
        } catch (err) {
            const error = err instanceof SyntaxError
                ? new ParsingError(
                    'Invalid package.json',
                    path.join(projectPath, 'package.json'),
                    undefined,
                    undefined,
                    { projectPath },
                    err
                )
                : new FileSystemError(
                    'Could not read package.json',
                    path.join(projectPath, 'package.json'),
                    'read',
                    { projectPath },
                    err instanceof Error ? err : undefined
                );
            handleError(error, {
                operation: 'get project name',
                component: 'TypeScriptResolver',
                metadata: { projectPath }
            });
        }
        
        return null;
    }

    public isTestFile(filePath: string): boolean {
        // TypeScript/JavaScript specific patterns
        if (super.isTestFile(filePath)) {
            return true;
        }
        
        // Check for .d.ts definition files
        if (filePath.endsWith('.d.ts')) {
            return false; // Definition files are not test files, but should be filtered elsewhere
        }
        
        return false;
    }

    public shouldAnalyzeFile(filePath: string): boolean {
        if (!super.shouldAnalyzeFile(filePath)) {
            return false;
        }

        // TypeScript-specific: ignore definition files
        if (filePath.endsWith('.d.ts')) {
            return false;
        }

        return true;
    }

    public dispose(): void {
        super.dispose();
        this.initialized = false;
        // Parsers don't need explicit cleanup, but reset state
        this.tsLanguage = null;
        this.tsxLanguage = null;
        this.jsLanguage = null;
    }

    // Helper methods

    private extractStringLiteral(text: string): string {
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

    private fallbackExtractImports(content: string, sourceFile: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        const importRegex = /(?:import|export)\s+.*?from\s+['"](.+?)['"]/g;
        
        // Using regex fallback for imports
        log(`[TypeScriptResolver] Using regex fallback for imports in ${path.basename(sourceFile)}`);
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            
            let importType: 'relative' | 'absolute' | 'package' | 'alias' = 'relative';
            if (importPath.startsWith('.')) {
                importType = 'relative';
            } else if (importPath.startsWith('@')) {
                importType = 'alias';
            } else {
                importType = 'package';
            }
            
            imports.push({
                importPath,
                importType,
            });
        }
        
        return imports;
    }

    private fallbackExtractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        log(`[TypeScriptResolver] Using FALLBACK regex extraction for ${path.basename(fileId)}`);

        // Extract classes
        const classRegex = /class\s+(\w+)/g;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const nodeId = `${fileId}-class-${className}`;
            log(`[TypeScriptResolver] [FALLBACK] ✓ Extracting CLASS: ${className} (nodeId: ${nodeId})`);
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
            log(`[TypeScriptResolver] [FALLBACK] ✓ Extracting FUNCTION: ${functionName} (nodeId: ${nodeId})`);
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
        
        log(`[TypeScriptResolver] [FALLBACK] ✓ Symbol extraction complete: ${nodes.length} symbols extracted from ${path.basename(fileId)}`);
        if (nodes.length > 0) {
            log(`[TypeScriptResolver] [FALLBACK]   Symbols: ${nodes.map(n => `${n.data.type}:${n.data.label}`).join(', ')}`);
        }
        
        return { nodes, edges };
    }
}



