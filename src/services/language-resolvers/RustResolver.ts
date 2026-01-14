/**
 * Rust language resolver
 * 
 * Handles Rust (.rs) files
 * Uses tree-sitter-rust for accurate AST parsing
 */

import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BaseLanguageResolver } from './BaseLanguageResolver';
import { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
import { GraphNode, GraphEdge } from '../../types';
import { log } from '../../logger';

// Import Rust parser
let Rust: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Rust = require('tree-sitter-rust');
} catch (e) {
    log('[RustResolver] tree-sitter-rust not available');
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

export class RustResolver extends BaseLanguageResolver implements LanguageResolver {
    private rustParser: Parser;
    private rustLanguage: any;
    private initialized: boolean = false;
    private crateName: string | null = null;

    constructor() {
        super('rust', ['.rs'], 'Rust');
        this.rustParser = new Parser();
    }

    public async initialize(rootPath: string): Promise<void> {
        await super.initialize(rootPath);
        
        try {
            log('[RustResolver] Starting initialization...');
            
            if (!Rust) {
                log('[RustResolver] ✗ Rust parser module not available');
                this.initialized = false;
                return;
            }

            this.rustLanguage = Rust;
            this.rustParser.setLanguage(Rust);
            log('[RustResolver] Rust parser configured');
            
            // Try to read Cargo.toml to get crate name
            const cargoToml = path.join(rootPath, 'Cargo.toml');
            if (fs.existsSync(cargoToml)) {
                try {
                    const content = fs.readFileSync(cargoToml, 'utf-8');
                    // Simple regex to find package name (for full support, use TOML parser)
                    const nameMatch = content.match(/\[package\]\s*\n\s*name\s*=\s*"([^"]+)"/);
                    if (nameMatch) {
                        this.crateName = nameMatch[1];
                        log(`[RustResolver] Found crate name: ${this.crateName}`);
                    }
                } catch (e) {
                    log(`[RustResolver] Could not read Cargo.toml: ${e}`);
                }
            }
            
            // Test that queries work
            try {
                const Query = Parser.Query;
                new Query(Rust, '(use_declaration (scoped_use_list (identifier) @use))');
                log(`[RustResolver] Query test successful`);
            } catch (queryError) {
                log(`[RustResolver] WARNING: Query test failed: ${queryError}`);
            }
            
            this.initialized = true;
            log('[RustResolver] ✓ Initialized successfully');
        } catch (error) {
            log(`[RustResolver] ✗ Initialization failed: ${error}`);
            this.initialized = false;
        }
    }

    public getParserForFile(filePath: string): ParserInfo | null {
        if (!this.initialized || !Rust) {
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.rs') {
            return { parser: this.rustParser, language: this.rustLanguage };
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

            // Rust tree-sitter query for use statements
            const Query = Parser.Query;
            const queryString = `
                (use_declaration 
                    (scoped_use_list 
                        (use_list 
                            (scoped_identifier) @use-path))) @use
                
                (use_declaration 
                    (scoped_identifier) @use-path) @use-single
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const usePathNode = match.captures.find((c: QueryCapture) => c.name === 'use-path');
                if (!usePathNode) continue;

                const usePath = usePathNode.node.text;
                // Determine import type
                let importType: 'relative' | 'absolute' | 'package' | 'alias' = 'package';
                
                if (usePath.startsWith('crate::') || usePath.startsWith('self::') || usePath.startsWith('super::')) {
                    importType = 'relative';
                } else if (usePath.startsWith('::')) {
                    importType = 'absolute';
                } else {
                    // External crate or standard library
                    importType = 'package';
                }

                imports.push({
                    importPath: usePath,
                    importType,
                    lineNumber: usePathNode.node.startPosition.row + 1,
                });
            }

            return imports;
        } catch (error) {
            log(`[RustResolver] Error parsing imports for ${path.basename(sourceFile)}: ${error}. Falling back to regex.`);
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

            // Rust tree-sitter query for structs, enums, traits, and functions
            const Query = Parser.Query;
            const queryString = `
                (struct_item name: (type_identifier) @struct-name) @struct
                
                (enum_item name: (type_identifier) @enum-name) @enum
                
                (trait_item name: (type_identifier) @trait-name) @trait
                
                (function_item name: (identifier) @function-name) @function
                
                (impl_item trait: (type_identifier) @trait-name) @impl
            `;
            
            const query = new Query(language, queryString);
            const matches = query.matches(tree.rootNode);

            for (const match of matches) {
                const structNode = match.captures.find((c: QueryCapture) => c.name === 'struct');
                const structName = match.captures.find((c: QueryCapture) => c.name === 'struct-name');
                
                if (structNode && structName) {
                    const name = structName.node.text;
                    const nodeId = `${fileId}-struct-${name}`;
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

                const traitNode = match.captures.find((c: QueryCapture) => c.name === 'trait');
                const traitName = match.captures.find((c: QueryCapture) => c.name === 'trait-name');
                
                if (traitNode && traitName) {
                    const name = traitName.node.text;
                    const nodeId = `${fileId}-trait-${name}`;
                    nodes.push({
                        data: {
                            id: nodeId,
                            label: name,
                            type: 'class',
                            category: 'class',
                            parent: fileId,
                            sizeMultiplier: 1.4,
                            isCompound: false,
                        }
                    });
                    continue;
                }

                const functionNode = match.captures.find((c: QueryCapture) => c.name === 'function');
                const functionName = match.captures.find((c: QueryCapture) => c.name === 'function-name');
                
                if (functionNode && functionName) {
                    // Check if it's a top-level function (not inside impl block)
                    let isTopLevel = true;
                    let parent = functionNode.node.parent;
                    while (parent) {
                        if (parent.type === 'impl_item') {
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
            log(`[RustResolver] Error parsing symbols for ${fileId}: ${error}`);
            return { nodes: [], edges: [] };
        }
    }

    public resolveImportPath(importPath: string, sourceFile: string, rootPath: string): string | null {
        // Handle crate-relative imports
        if (importPath.startsWith('crate::')) {
            const relativePath = importPath.substring('crate::'.length).replace(/::/g, path.sep);
            const candidates = [
                path.join(rootPath, 'src', relativePath + '.rs'),
                path.join(rootPath, 'src', relativePath, 'mod.rs'),
                path.join(rootPath, 'src', relativePath, 'lib.rs'),
            ];
            
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        }

        // Handle self:: and super:: relative imports
        if (importPath.startsWith('self::') || importPath.startsWith('super::')) {
            const sourceDir = path.dirname(sourceFile);
            const relativePath = importPath.replace(/^(self|super)::/, '').replace(/::/g, path.sep);
            
            if (importPath.startsWith('super::')) {
                // Go up one directory
                const parentDir = path.dirname(sourceDir);
                const candidate = path.join(parentDir, relativePath + '.rs');
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            } else {
                // Same directory
                const candidate = path.join(sourceDir, relativePath + '.rs');
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        }

        // External crate - don't resolve (it's in Cargo registry)
        return null;
    }

    public async findEntryPoints(rootPath: string): Promise<string[]> {
        const found: string[] = [];

        log(`[RustResolver] Searching for entry points in: ${rootPath}`);

        // Rust entry points: main.rs or lib.rs
        const mainRs = path.join(rootPath, 'src', 'main.rs');
        const libRs = path.join(rootPath, 'src', 'lib.rs');

        if (fs.existsSync(mainRs)) {
            found.push(mainRs);
            log(`[RustResolver] Found entry point: src/main.rs`);
        }

        if (fs.existsSync(libRs)) {
            found.push(libRs);
            log(`[RustResolver] Found entry point: src/lib.rs`);
        }

        // Check for binary targets in Cargo.toml
        const cargoToml = path.join(rootPath, 'Cargo.toml');
        if (fs.existsSync(cargoToml)) {
            try {
                const content = fs.readFileSync(cargoToml, 'utf-8');
                // Simple regex to find binary targets (for full support, use TOML parser)
                const binaryMatch = content.match(/\[\[bin\]\]\s*\n\s*name\s*=\s*"([^"]+)"\s*\n\s*path\s*=\s*"([^"]+)"/);
                if (binaryMatch) {
                    const binPath = binaryMatch[2];
                    const fullPath = path.join(rootPath, binPath);
                    if (fs.existsSync(fullPath) && !found.includes(fullPath)) {
                        found.push(fullPath);
                        log(`[RustResolver] Found binary entry point: ${binPath}`);
                    }
                }
            } catch (e) {
                log(`[RustResolver] Could not parse Cargo.toml: ${e}`);
            }
        }

        // Check src/bin/ directory for binary crates
        const binDir = path.join(rootPath, 'src', 'bin');
        if (fs.existsSync(binDir) && fs.statSync(binDir).isDirectory()) {
            const binFiles = fs.readdirSync(binDir);
            for (const binFile of binFiles) {
                if (binFile.endsWith('.rs')) {
                    const fullPath = path.join(binDir, binFile);
                    if (!found.includes(fullPath)) {
                        found.push(fullPath);
                        log(`[RustResolver] Found binary entry point: src/bin/${binFile}`);
                    }
                }
            }
        }

        return found;
    }

    public isTestFile(filePath: string): boolean {
        // Rust test file pattern: *test.rs or in tests/ directory
        const fileName = path.basename(filePath);
        return fileName.includes('test') || 
               filePath.includes('/tests/') ||
               super.isTestFile(filePath);
    }

    public shouldAnalyzeFile(filePath: string): boolean {
        if (!super.shouldAnalyzeFile(filePath)) {
            return false;
        }

        // Rust-specific: ignore target directory (build output)
        if (filePath.includes('/target/')) {
            return false;
        }

        return true;
    }

    public dispose(): void {
        super.dispose();
        this.initialized = false;
        this.rustLanguage = null;
        this.crateName = null;
    }

    // Helper methods

    private fallbackExtractImports(content: string, sourceFile: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        // Rust use statement patterns
        const useRegex = /use\s+([\w:]+(?:::\*)?);/g;
        
        let match;
        while ((match = useRegex.exec(content)) !== null) {
            imports.push({
                importPath: match[1],
                importType: match[1].startsWith('crate::') || match[1].startsWith('self::') || match[1].startsWith('super::') 
                    ? 'relative' 
                    : 'package',
            });
        }
        
        return imports;
    }
}


