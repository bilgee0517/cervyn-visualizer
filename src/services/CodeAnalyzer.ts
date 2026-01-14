import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GraphData, GraphNode, GraphEdge, Layer } from '../types';
import { log, debug, warn, error, createThrottledLogger } from '../logger';
import { CodeMetricsCalculator } from './CodeMetricsCalculator';
import { TreeSitterAnalyzer } from './TreeSitterAnalyzer';
import { initializeDefaultResolvers, getResolverRegistry } from './language-resolvers';

export class CodeAnalyzer {
    private readonly MAX_NODES = 500; // Increased for multi-project workspaces
    private readonly MAX_DEPTH = 10;
    private metricsCalculator = new CodeMetricsCalculator();
    private treeSitterAnalyzer = new TreeSitterAnalyzer();
    private resolversInitialized = false;
    
    public async analyzeWorkspace(layer: Layer): Promise<GraphData> {
        log(`Analyzing workspace (${layer} layer)`);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            log('❌ No workspace folders found - please open a folder in VS Code');
            return { nodes: [], edges: [] };
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const folderName = path.basename(rootPath);
        log(`📁 Analyzing folder: ${folderName}`);
        log(`   Full path: ${rootPath}`);
        
        // Initialize resolver registry if not already done
        if (!this.resolversInitialized) {
            log(`\n🔧 Initializing language resolvers...`);
            await initializeDefaultResolvers(rootPath);
            this.treeSitterAnalyzer.setRootPath(rootPath);
            this.resolversInitialized = true;
        }
        
        if (workspaceFolders.length > 1) {
            log(`ℹ️  Note: You have ${workspaceFolders.length} folders open. Analyzing the first one only.`);
        }
        
        switch (layer) {
            case 'blueprint':
                // NOTE: Basic implementation - will be enhanced with more sophisticated visualization later
                return this.generateBlueprintLayer(rootPath);
            case 'architecture':
                // NOTE: Basic implementation - will be enhanced with more sophisticated visualization later
                return this.generateArchitectureLayer(rootPath);
            case 'implementation':
                // Fully implemented layer with detailed code structure analysis
                return this.generateImplementationLayer(rootPath);
            case 'dependencies':
                // NOTE: Basic implementation - will be enhanced with more sophisticated visualization later
                return this.generateDependenciesLayer(rootPath);
            default:
                return { nodes: [], edges: [] };
        }
    }

    /**
     * Incrementally analyze a single file and return nodes/edges for that file
     * This is used for incremental updates when a file changes
     */
    public async analyzeFileIncremental(
        filePath: string,
        layer: Layer,
        existingGraph: GraphData
    ): Promise<GraphData> {
        log(`\n=== INCREMENTAL FILE ANALYSIS ===`);
        log(`📄 Analyzing file: ${filePath}`);
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { nodes: [], edges: [] };
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const relativePath = path.relative(rootPath, filePath);
        
        // Initialize resolver registry if not already done
        if (!this.resolversInitialized) {
            log(`\n🔧 Initializing language resolvers...`);
            await initializeDefaultResolvers(rootPath);
            this.treeSitterAnalyzer.setRootPath(rootPath);
            this.resolversInitialized = true;
        }

        // Check if file should be analyzed
        if (!this.shouldAnalyzeFile(relativePath)) {
            log(`⏭️  Skipping file (filtered): ${relativePath}`);
            return { nodes: [], edges: [] };
        }

        // Only support implementation and architecture layers for incremental updates
        // (they use file-level analysis, blueprint/dependencies are different)
        if (layer !== 'implementation' && layer !== 'architecture') {
            log(`⏭️  Incremental updates not supported for ${layer} layer, falling back to full analysis`);
            return this.analyzeWorkspace(layer);
        }

        const includeSymbols = layer === 'implementation';
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const folderNodes = new Map<string, GraphNode>();

        // Extract folder hierarchy (check existing graph first to avoid duplicates)
        const parentFolderId = this.createFolderHierarchy(relativePath, rootPath, folderNodes, nodes, existingGraph);

        // Create file node
        const fileName = path.basename(filePath);
        const fileId = `file-${relativePath}`;
        
        // Categorize
        let category = 'module';
        if (relativePath.includes('component')) category = 'component';
        else if (relativePath.includes('service')) category = 'service';
        else if (relativePath.includes('util')) category = 'utility';
        else if (relativePath.includes('model')) category = 'model';

        // Calculate metrics
        let metrics = {};
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            metrics = this.metricsCalculator.calculateFileMetrics(filePath, content);

            // Create file node
            nodes.push({
                data: {
                    id: fileId,
                    label: fileName,
                    type: 'file',
                    path: filePath,
                    category,
                    fileExtension: path.extname(filePath).substring(1),
                    shape: this.getShapeForCategory(category),
                    parent: parentFolderId,
                    isCompound: true,
                    groupType: 'file',
                    linesOfCode: (metrics as any).linesOfCode || 0,
                    complexity: (metrics as any).cyclomaticComplexity || 0,
                    daysSinceLastChange: (metrics as any).daysSinceLastChange || 0,
                    layer: this.metricsCalculator.detectLayer(filePath),
                    sizeMultiplier: 2.5,
                    isCollapsed: !!parentFolderId,
                    revealThreshold: 3.0
                }
            });

            // Extract imports
            const imports = this.treeSitterAnalyzer.extractImports(content, filePath);
            for (const edge of imports) {
                const targetPath = edge.data.target;
                const targetRelativePath = path.relative(rootPath, targetPath);
                const targetFileId = `file-${targetRelativePath}`;
                
                edges.push({
                    data: {
                        id: `${fileId}->${targetFileId}`,
                        source: fileId,
                        target: targetFileId,
                        edgeType: 'imports'
                    }
                });
            }

            // Extract symbols if implementation layer
            if (includeSymbols) {
                const symbols = this.treeSitterAnalyzer.extractSymbols(content, fileId);
                nodes.push(...symbols.nodes);
                edges.push(...symbols.edges);
            }

        } catch (e) {
            log(`  ✗ Failed to parse ${fileName}: ${e}`);
        }

        // Add folder nodes
        nodes.push(...Array.from(folderNodes.values()));

        log(`✓ Incremental analysis: ${nodes.length} nodes, ${edges.length} edges for ${fileName}`);

        return { nodes, edges };
    }

    /**
     * Check if a directory name should be excluded from analysis
     */
    private isExcludedDirectory(dirName: string): boolean {
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
    private isExcludedPath(relativePath: string): boolean {
        // Check if any segment of the path contains excluded directories
        const parts = relativePath.split(path.sep);
        for (const part of parts) {
            if (this.isExcludedDirectory(part)) {
                return true;
            }
        }
        return false;
    }

    private shouldAnalyzeFile(relativePath: string): boolean {
        // Check for excluded directories in the path
        if (this.isExcludedPath(relativePath)) {
            return false;
        }

        // Ignore test files
        if (relativePath.endsWith('.test.ts') || 
            relativePath.endsWith('.spec.ts') || 
            relativePath.endsWith('.test.js') || 
            relativePath.endsWith('.spec.js')) {
            return false;
        }

        // Ignore definition files
        if (relativePath.endsWith('.d.ts')) {
            return false;
        }

        // Ignore config files
        const configFiles = ['.eslintrc', 'tsconfig', 'package', 'jest.config', 'webpack.config', 'babel.config'];
        if (configFiles.some(config => relativePath.includes(config))) {
            return false;
        }

        return true;
    }

    /**
     * Generate blueprint layer visualization
     * NOTE: This is a basic implementation. More sophisticated visualization will be added later.
     */
    private async generateBlueprintLayer(rootPath: string): Promise<GraphData> {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // Only look at top-level directories in src/ or lib/
        const pattern = new vscode.RelativePattern(rootPath, '{src,lib,app}/*');
        const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache}/**');
        
        const dirSet = new Set<string>();
        for (const file of files) {
            const relativePath = path.relative(rootPath, file.fsPath);
            if (!this.shouldAnalyzeFile(relativePath)) continue;

            const parts = relativePath.split(path.sep);
            if (parts.length > 1) {
                dirSet.add(parts[0] + '/' + parts[1]); // Capture src/browser etc.
            }
        }

        dirSet.forEach(dir => {
            nodes.push({
                data: {
                    id: `dir-${dir}`,
                    label: dir,
                    type: 'directory',
                    category: 'module',
                    shape: 'round-rectangle',
                    roleDescription: `${dir} module`
                }
            });
        });

        return { nodes, edges };
    }

    /**
     * Generate architecture layer visualization
     * NOTE: This is a basic implementation. More sophisticated visualization will be added later.
     */
    private async generateArchitectureLayer(rootPath: string): Promise<GraphData> {
        // Start from entry points and only follow imports
        const entryPoints = await this.findEntryPoints(rootPath);
        return this.buildReachableGraph(rootPath, entryPoints, false);
    }

    private async generateImplementationLayer(rootPath: string): Promise<GraphData> {
        // Same as architecture but includes symbols
        const entryPoints = await this.findEntryPoints(rootPath);
        return this.buildReachableGraph(rootPath, entryPoints, true);
    }

    private async findEntryPoints(rootPath: string): Promise<string[]> {
        const found: string[] = [];

        log(`\n🔍 Searching for entry points in: ${rootPath}`);

        // 1. Check if root has package.json - if so, analyze it directly
        const rootPackageJson = path.join(rootPath, 'package.json');
        if (fs.existsSync(rootPackageJson)) {
            log(`✓ Found package.json at root`);
            const entryPoint = await this.findEntryPointFromPackageJson(rootPath);
            if (entryPoint) {
                found.push(entryPoint);
            }
        }

        // 2. Check for subdirectories that are separate projects (have package.json)
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            const subdirs = entries.filter(e => e.isDirectory() && !this.isExcludedDirectory(e.name));
            
            log(`📂 Found ${subdirs.length} subdirectories to check`);
            
            for (const subdir of subdirs) {
                const subdirPath = path.join(rootPath, subdir.name);
                const subdirPackageJson = path.join(subdirPath, 'package.json');
                
                if (fs.existsSync(subdirPackageJson)) {
                    log(`✓ Found project in subdirectory: ${subdir.name}`);
                    const entryPoint = await this.findEntryPointFromPackageJson(subdirPath);
                    if (entryPoint) {
                        found.push(entryPoint);
                    }
                }
            }
        } catch (e) {
            log(`⚠️  Could not scan subdirectories: ${e}`);
        }

        // 3. Fallback: Look for common entry points
        if (found.length === 0) {
            log(`⚠️  No package.json-based entry points found, trying common patterns...`);
            const candidates = [
                'src/index.ts', 'src/main.ts', 'src/App.tsx', 'src/index.js',
                'lib/index.ts', 'src/extension.ts', 'index.ts'
            ];
            
            for (const cand of candidates) {
                const fullPath = path.join(rootPath, cand);
                if (fs.existsSync(fullPath)) {
                    found.push(fullPath);
                    log(`✓ Found: ${cand}`);
                }
            }
        }

        // 4. Last resort: Find any index files
        if (found.length === 0) {
            log(`⚠️  No common entry points found, searching for any index files...`);
            const indices = await vscode.workspace.findFiles(
                '**/index.{ts,js,tsx}',
                '**/{node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache,test}/**'
            );
            indices.forEach(uri => {
                if (this.shouldAnalyzeFile(path.relative(rootPath, uri.fsPath))) {
                    found.push(uri.fsPath);
                }
            });
        }

        log(`\n=== ENTRY POINTS FOUND: ${found.length} ===`);
        found.forEach(f => log(`  - ${path.relative(rootPath, f)}`));
        return found.slice(0, 5); // Increased limit to 5 to handle multiple projects
    }

    private async findEntryPointFromPackageJson(projectPath: string): Promise<string | null> {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // Check for Theia extension
            if (packageJson.theiaExtensions && Array.isArray(packageJson.theiaExtensions)) {
                log(`  ℹ️  Detected Theia extension`);
                // Theia extensions typically have src/browser or src/node entry points
                const theiaEntry = packageJson.theiaExtensions[0];
                if (theiaEntry.frontend) {
                    // Convert lib/browser/... to src/browser/...
                    const sourcePath = theiaEntry.frontend
                        .replace(/^lib\//, 'src/')
                        .replace(/-frontend-module$/, '');
                    
                    // Try the module file or index.ts
                    const candidates = [
                        `${sourcePath}.ts`,
                        path.join(path.dirname(sourcePath), 'index.ts'),
                        'src/browser/index.ts'
                    ];
                    
                    for (const cand of candidates) {
                        const fullPath = path.join(projectPath, cand);
                        if (fs.existsSync(fullPath)) {
                            log(`  ✓ Entry (Theia): ${cand}`);
                            return fullPath;
                        }
                    }
                }
            }
            
            // Check 'main' field (common for Node/VS Code extensions)
            if (packageJson.main) {
                const mainPath = packageJson.main;
                // Convert from compiled path (./out/extension.js) to source (./src/extension.ts)
                const sourcePath = mainPath
                    .replace(/^\.\/out\//, './src/')
                    .replace(/^\.\/dist\//, './src/')
                    .replace(/^\.\/lib\//, './src/')
                    .replace(/\.js$/, '.ts');
                
                const fullPath = path.join(projectPath, sourcePath);
                if (fs.existsSync(fullPath)) {
                    log(`  ✓ Entry from package.json: ${sourcePath}`);
                    return fullPath;
                }
            }

            // For React apps, check 'module' field
            if (packageJson.module) {
                const modulePath = path.join(projectPath, packageJson.module);
                if (fs.existsSync(modulePath)) {
                    log(`  ✓ Entry from package.json (module): ${packageJson.module}`);
                    return modulePath;
                }
            }
            
            // Look for common patterns in this project
            const candidates = ['src/index.ts', 'src/main.ts', 'src/extension.ts', 'src/browser/index.ts'];
            for (const cand of candidates) {
                const fullPath = path.join(projectPath, cand);
                if (fs.existsSync(fullPath)) {
                    log(`  ✓ Entry by convention: ${cand}`);
                    return fullPath;
                }
            }
        } catch (e) {
            log(`  ✗ Could not read package.json in ${projectPath}: ${e}`);
        }
        
        log(`  ✗ No entry point found for ${path.basename(projectPath)}`);
        return null;
    }

    private async buildReachableGraph(rootPath: string, entryPoints: string[], includeSymbols: boolean): Promise<GraphData> {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const visited = new Set<string>();
        const queue: { path: string, depth: number }[] = entryPoints.map(p => ({ path: p, depth: 0 }));
        let nodeCount = 0;
        const folderNodes = new Map<string, GraphNode>(); // Track created folder nodes
        
        // First, discover all source directories and files, then create folder nodes for them
        // This ensures folders appear even if their files aren't directly imported
        log(`\n📂 Pre-scanning source directories and files...`);
        await this.discoverSourceDirectories(rootPath, folderNodes, nodes, visited, queue);
        log(`📂 Created ${folderNodes.size} folder nodes from directory scan`);

        log(`\n🏗️  Building graph from ${entryPoints.length} entry points...`);
        log(`Initial queue:`);
        entryPoints.forEach((ep, i) => log(`  ${i + 1}. ${path.relative(rootPath, ep)}`));
        
        // Track which entry points we've started processing
        const entryPointSet = new Set(entryPoints);
        const processedEntryPoints = new Set<string>();

        while (queue.length > 0 && nodeCount < this.MAX_NODES) {
            const { path: currentPath, depth } = queue.shift()!;
            
            // Special logging for entry points (always logged - important)
            if (entryPointSet.has(currentPath) && !processedEntryPoints.has(currentPath)) {
                log(`Starting entry point: ${path.relative(rootPath, currentPath)}`);
                processedEntryPoints.add(currentPath);
            }
            
            if (visited.has(currentPath)) {
                // Only warn if it's an entry point being skipped (important)
                if (entryPointSet.has(currentPath)) {
                    warn(`Entry point already visited: ${path.relative(rootPath, currentPath)}`);
                }
                continue;
            }
            if (depth > this.MAX_DEPTH) {
                debug(`Skipping ${path.basename(currentPath)} - reached max depth (${this.MAX_DEPTH})`);
                continue;
            }
            
            visited.add(currentPath);

            const relativePath = path.relative(rootPath, currentPath);
            if (!this.shouldAnalyzeFile(relativePath)) {
                if (entryPointSet.has(currentPath)) {
                    error(`Entry point filtered out by shouldAnalyzeFile: ${relativePath}`);
                }
                continue;
            }

            // Use throttled logger for processing updates (performance optimization)
            // Only logs every 50th file in normal mode, or every file in debug mode
            if (nodeCount % 50 === 0 || entryPointSet.has(currentPath)) {
                if (entryPointSet.has(currentPath)) {
                    log(`Processing entry point [${nodeCount}]: ${relativePath}`);
                } else {
                    debug(`Processing [${nodeCount}]: ${relativePath} (depth: ${depth}, queue: ${queue.length})`);
                }
            }

            // Add node
            const fileName = path.basename(currentPath);
            const fileId = `file-${relativePath}`;
            
            // Categorize
            let category = 'module';
            if (relativePath.includes('component')) category = 'component';
            else if (relativePath.includes('service')) category = 'service';
            else if (relativePath.includes('util')) category = 'utility';
            else if (relativePath.includes('model')) category = 'model';

            // Create folder hierarchy for this file
            const parentFolderId = this.createFolderHierarchy(relativePath, rootPath, folderNodes, nodes);

            // Calculate metrics for this file
            let metrics = {};
            try {
                const content = fs.readFileSync(currentPath, 'utf-8');
                metrics = this.metricsCalculator.calculateFileMetrics(currentPath, content);
            } catch (e) {
                // Failed to read file, use defaults
            }

            nodes.push({
                data: {
                    id: fileId,
                    label: fileName,
                    type: 'file',
                    path: currentPath,
                    category,
                    fileExtension: path.extname(currentPath).substring(1),
                    shape: this.getShapeForCategory(category),
                    parent: parentFolderId, // Set parent for compound node nesting
                    // CRITICAL: Mark as compound since files can contain classes/functions
                    isCompound: true, // File nodes are containers for classes/functions
                    groupType: 'file',
                    // Add metrics
                    linesOfCode: (metrics as any).linesOfCode || 0,
                    complexity: (metrics as any).cyclomaticComplexity || 0,
                    daysSinceLastChange: (metrics as any).daysSinceLastChange || 0,
                    // Detect layer
                    layer: this.metricsCalculator.detectLayer(currentPath),
                    // Size scaling for visual representation (files are medium-sized)
                    sizeMultiplier: 2.5,
                    // Start hidden if inside a folder
                    isCollapsed: !!parentFolderId,
                    // Reveal threshold for classes inside
                    revealThreshold: 3.0
                }
            });
            nodeCount++;

            try {
                const content = fs.readFileSync(currentPath, 'utf-8');
                
                // Extract imports using tree-sitter (with regex fallback)
                const imports = this.treeSitterAnalyzer.extractImports(content, currentPath);
                
                for (const edge of imports) {
                    const targetPath = edge.data.target; // This is absolute path now from extractImports
                    
                    // Add edge
                    edges.push({
                        data: {
                            id: edge.data.id.replace(currentPath, fileId).replace(targetPath, `file-${path.relative(rootPath, targetPath)}`),
                            source: fileId,
                            target: `file-${path.relative(rootPath, targetPath)}`,
                            edgeType: 'imports'
                        }
                    });

                    // Add to queue if it exists and not visited
                    if (fs.existsSync(targetPath) && !visited.has(targetPath)) {
                        queue.push({ path: targetPath, depth: depth + 1 });
                    }
                }

                // Extract symbols if implementation layer using tree-sitter (with regex fallback)
                if (includeSymbols && nodeCount < this.MAX_NODES) {
                    const symbols = this.treeSitterAnalyzer.extractSymbols(content, fileId);
                    nodes.push(...symbols.nodes);
                    edges.push(...symbols.edges);
                    nodeCount += symbols.nodes.length;
                }

            } catch (e) {
                log(`  ✗ Failed to parse ${path.basename(currentPath)}: ${e}`);
            }
        }

        if (nodeCount >= this.MAX_NODES) {
            log(`\n⚠️  Reached node limit (${this.MAX_NODES}). Some files were not analyzed.`);
            log(`⚠️  Entry points processed: ${processedEntryPoints.size}/${entryPoints.length}`);
            if (processedEntryPoints.size < entryPoints.length) {
                log(`❌ Not all entry points were reached! Missing:`);
                entryPoints.forEach(ep => {
                    if (!processedEntryPoints.has(ep)) {
                        log(`   - ${path.relative(rootPath, ep)}`);
                    }
                });
            }
        }
        
        log(`\n✅ Graph built: ${nodes.length} nodes, ${edges.length} edges`);
        log(`   Entry points processed: ${processedEntryPoints.size}/${entryPoints.length}`);
        log(`   Folder nodes: ${Array.from(nodes).filter(n => n.data.type === 'directory').length}`);
        log(`   File nodes: ${Array.from(nodes).filter(n => n.data.type === 'file').length}`);
        return { nodes, edges };
    }

    /**
     * Generate dependencies layer visualization
     * NOTE: This is a basic implementation. More sophisticated visualization will be added later.
     */
    private async generateDependenciesLayer(rootPath: string): Promise<GraphData> {
        // Dependencies: External dependencies
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // Read package.json
        try {
            const packageJsonPath = path.join(rootPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const dependencies = { ...packageJson.dependencies }; // Only production deps

                Object.keys(dependencies).forEach(dep => {
                    nodes.push({
                        data: {
                            id: `dep-${dep}`,
                            label: dep,
                            type: 'module',
                            category: 'dependency',
                            shape: 'round-hexagon'
                        }
                    });
                    edges.push({
                        data: {
                            id: `edge-root-${dep}`,
                            source: 'project-root',
                            target: `dep-${dep}`,
                            edgeType: 'depends-on'
                        }
                    });
                });
                
                nodes.push({
                    data: {
                        id: 'project-root',
                        label: packageJson.name || 'Project',
                        type: 'module',
                        category: 'entry',
                        isEntryPoint: true,
                        shape: 'round-octagon'
                    }
                });
            }
        } catch (error) {
            console.warn('Failed to read package.json:', error);
        }

        return { nodes, edges };
    }

    /**
     * @deprecated Use TreeSitterAnalyzer.extractImports instead
     * Kept for backward compatibility - delegates to TreeSitterAnalyzer
     */
    private extractImports(content: string, sourceFile: string): GraphEdge[] {
        return this.treeSitterAnalyzer.extractImports(content, sourceFile);
    }

    /**
     * @deprecated Use TreeSitterAnalyzer.extractSymbols instead
     * Kept for backward compatibility - delegates to TreeSitterAnalyzer
     */
    private extractSymbols(content: string, fileId: string): { nodes: GraphNode[], edges: GraphEdge[] } {
        return this.treeSitterAnalyzer.extractSymbols(content, fileId);
    }

    private getShapeForCategory(category: string): string {
        const shapeMap: Record<string, string> = {
            'component': 'round-rectangle',
            'service': 'round-diamond',
            'utility': 'round-hexagon',
            'model': 'round-triangle',
            'module': 'ellipse'
        };
        return shapeMap[category] || 'ellipse';
    }

    /**
     * Creates folder hierarchy for a file path and returns the immediate parent folder ID.
     * Creates all intermediate folder nodes if they don't exist.
     * @param relativePath - Path relative to workspace root (e.g., "src/components/Button.tsx")
     * @param rootPath - Absolute workspace root path
     * @param folderNodes - Map to track created folder nodes
     * @param nodes - Array to add new folder nodes to
     * @returns ID of the immediate parent folder
     */
    private createFolderHierarchy(
        relativePath: string, 
        rootPath: string, 
        folderNodes: Map<string, GraphNode>,
        nodes: GraphNode[],
        existingGraph?: GraphData
    ): string | undefined {
        const pathParts = relativePath.split(path.sep);
        
        // Remove the filename, keep only directory parts
        pathParts.pop();
        
        if (pathParts.length === 0) {
            // File is at root level, no parent
            return undefined;
        }

        // Build a set of existing folder IDs from the existing graph for fast lookup
        const existingFolderIds = new Set<string>();
        if (existingGraph && existingGraph.nodes) {
            for (const node of existingGraph.nodes) {
                if (node.data.type === 'directory') {
                    existingFolderIds.add(node.data.id);
                }
            }
        }

        let currentPath = '';
        let parentId: string | undefined = undefined;

        // Build folder hierarchy from root to immediate parent
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            
            // Skip excluded directories
            if (this.isExcludedDirectory(part)) {
                break;
            }
            
            currentPath = currentPath ? `${currentPath}${path.sep}${part}` : part;
            const folderId = `folder-${currentPath}`;

            // Check if folder already exists in existing graph OR in this analysis
            const folderExists = existingFolderIds.has(folderId) || folderNodes.has(folderId);

            // Only create folder node if it doesn't exist
            if (!folderExists) {
                // Calculate depth for size scaling (deeper = smaller)
                const depth = i;
                const sizeMultiplier = Math.max(8.0 - (depth * 1.5), 2.0); // 8x at root, decreases with depth
                
                const folderNode: GraphNode = {
                    data: {
                        id: folderId,
                        label: part, // Just the folder name, not full path
                        type: 'directory',
                        path: path.join(rootPath, currentPath),
                        category: 'folder',
                        shape: 'round-rectangle',
                        isCompound: true, // Mark as container node
                        groupType: 'folder',
                        parent: parentId, // Link to parent folder
                        isCollapsed: true, // Start collapsed (children hidden)
                        childCount: 0, // Will be updated as children are added
                        // Size scaling for visual representation
                        sizeMultiplier: sizeMultiplier,
                        linesOfCode: 1000 * sizeMultiplier, // Large LOC for large visual size
                        // Zoom threshold - when to reveal children
                        revealThreshold: 1.5 + (depth * 0.5) // Deeper folders need more zoom
                    }
                };
                
                folderNodes.set(folderId, folderNode);
                nodes.push(folderNode);
                
                log(`  📁 Created folder node: ${currentPath} (parent: ${parentId || 'root'}, size: ${sizeMultiplier.toFixed(1)}x)`);
            } else {
                // Folder already exists - log for debugging but don't create
                debug(`  📁 Folder already exists: ${currentPath}, skipping creation`);
            }

            // Always set parentId to the folder ID (whether existing or newly created)
            // This ensures the file node gets the correct parent
            parentId = folderId;
        }

        return parentId; // Return immediate parent folder ID
    }

    /**
     * Pre-scan source directories to create folder nodes for all source folders
     * Also discovers all source files (not just those reachable via imports)
     * This ensures folders appear in the graph even if their files aren't directly imported
     */
    private async discoverSourceDirectories(
        rootPath: string,
        folderNodes: Map<string, GraphNode>,
        nodes: GraphNode[],
        visited: Set<string>,
        queue: { path: string, depth: number }[]
    ): Promise<void> {
        try {
            // Find all TypeScript/JavaScript files in the workspace
            // Use a broad pattern but exclude common build/ignore directories
            const allDirectories = new Set<string>();
            const discoveredFiles = new Set<string>();

            try {
                // Scan for all source files using resolver registry (supports multiple languages)
                const registry = getResolverRegistry();
                const pattern = registry.getSourceFilePattern() || '**/*.{ts,tsx,js,jsx}';
                const files = await vscode.workspace.findFiles(
                    pattern,
                    '**/{node_modules,dist,build,coverage,.git,out,.next,.nuxt,.cache}/**'
                );

                log(`📂 Found ${files.length} source files to scan for directories and files`);

                for (const file of files) {
                    const relativePath = path.relative(rootPath, file.fsPath);
                    const filePath = file.fsPath;
                    
                    // Skip if filtered by shouldAnalyzeFile
                    if (!this.shouldAnalyzeFile(relativePath)) continue;

                    // Track this file as discovered
                    discoveredFiles.add(filePath);

                    // Extract all directory parts from the file path
                    const parts = relativePath.split(path.sep);
                    parts.pop(); // Remove filename

                    // Build directory paths from root to file's directory
                    let currentDirPath = '';
                    for (const part of parts) {
                        // Skip empty parts and excluded directories
                        if (!part || this.isExcludedDirectory(part)) break;
                        
                        currentDirPath = currentDirPath ? `${currentDirPath}${path.sep}${part}` : part;
                        allDirectories.add(currentDirPath);
                    }
                }

                // Add discovered files to queue if they haven't been visited and aren't already queued
                // Use depth 1 so they're processed after entry points but before import-traversed files
                log(`📂 Adding ${discoveredFiles.size} discovered files to processing queue...`);
                let addedToQueue = 0;
                for (const filePath of discoveredFiles) {
                    if (!visited.has(filePath)) {
                        // Check if already in queue
                        const alreadyQueued = queue.some(item => item.path === filePath);
                        if (!alreadyQueued) {
                            queue.push({ path: filePath, depth: 1 }); // Depth 1 so they're processed early but after entry points
                            addedToQueue++;
                        }
                    }
                }
                log(`📂 Added ${addedToQueue} new files to queue for processing (will be processed after entry points)`);
            } catch (e) {
                log(`⚠️  Error scanning for source files: ${e}`);
            }

            // Create folder nodes for all discovered directories
            // Sort by depth (shallow first) to ensure parents are created before children
            const sortedDirs = Array.from(allDirectories).sort((a, b) => {
                const depthA = a.split(path.sep).length;
                const depthB = b.split(path.sep).length;
                if (depthA !== depthB) return depthA - depthB;
                return a.localeCompare(b);
            });

            for (const dirPath of sortedDirs) {
                const folderId = `folder-${dirPath}`;
                
                if (!folderNodes.has(folderId)) {
                    const parts = dirPath.split(path.sep);
                    const folderName = parts[parts.length - 1];
                    const depth = parts.length - 1;
                    const sizeMultiplier = Math.max(8.0 - (depth * 1.5), 2.0);

                    // Determine parent folder ID - parent should exist since we sorted by depth
                    let parentId: string | undefined = undefined;
                    if (parts.length > 1) {
                        const parentPath = parts.slice(0, -1).join(path.sep);
                        const parentFolderId = `folder-${parentPath}`;
                        if (folderNodes.has(parentFolderId)) {
                            parentId = parentFolderId;
                        } else {
                            // Create parent if it doesn't exist (shouldn't happen with proper sorting)
                            log(`⚠️  Parent folder ${parentPath} not found for ${dirPath}, creating it`);
                            const parentParts = parentPath.split(path.sep);
                            const parentFolderNode: GraphNode = {
                                data: {
                                    id: parentFolderId,
                                    label: parentParts[parentParts.length - 1],
                                    type: 'directory',
                                    path: path.join(rootPath, parentPath),
                                    category: 'folder',
                                    shape: 'round-rectangle',
                                    isCompound: true,
                                    groupType: 'folder',
                                    parent: undefined, // Will be set properly in next iteration
                                    isCollapsed: true,
                                    childCount: 0,
                                    sizeMultiplier: Math.max(8.0 - ((depth - 1) * 1.5), 2.0),
                                    linesOfCode: 1000 * Math.max(8.0 - ((depth - 1) * 1.5), 2.0),
                                    revealThreshold: 1.5 + ((depth - 1) * 0.5)
                                }
                            };
                            folderNodes.set(parentFolderId, parentFolderNode);
                            nodes.push(parentFolderNode);
                            parentId = parentFolderId;
                        }
                    }

                    const folderNode: GraphNode = {
                        data: {
                            id: folderId,
                            label: folderName,
                            type: 'directory',
                            path: path.join(rootPath, dirPath),
                            category: 'folder',
                            shape: 'round-rectangle',
                            isCompound: true,
                            groupType: 'folder',
                            parent: parentId,
                            isCollapsed: true,
                            childCount: 0,
                            sizeMultiplier: sizeMultiplier,
                            linesOfCode: 1000 * sizeMultiplier,
                            revealThreshold: 1.5 + (depth * 0.5)
                        }
                    };

                    folderNodes.set(folderId, folderNode);
                    nodes.push(folderNode);
                }
            }

            log(`✓ Discovered ${allDirectories.size} unique source directories`);
        } catch (error) {
            log(`⚠️  Error in discoverSourceDirectories: ${error}`);
        }
    }
}


