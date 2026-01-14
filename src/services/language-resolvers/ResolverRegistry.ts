/**
 * Registry for managing language resolvers
 * 
 * Handles registration, lookup, and initialization of language-specific resolvers
 */

import * as path from 'path';
import { LanguageResolver } from './LanguageResolver';
import { log } from '../../logger';

/**
 * Registry for language resolvers
 */
export class ResolverRegistry {
    private resolvers: Map<string, LanguageResolver> = new Map();
    private extensionMap: Map<string, LanguageResolver> = new Map();
    private initialized: boolean = false;
    private rootPath: string | null = null;

    /**
     * Register a language resolver
     */
    public register(resolver: LanguageResolver): void {
        this.resolvers.set(resolver.language, resolver);
        
        // Map file extensions to resolver for quick lookup
        for (const ext of resolver.extensions) {
            // Handle extensions with and without dot
            const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
            this.extensionMap.set(normalizedExt.toLowerCase(), resolver);
        }
        
        log(`[ResolverRegistry] Registered resolver: ${resolver.displayName} (${resolver.language})`);
    }

    /**
     * Get a resolver by language identifier
     */
    public getResolver(language: string): LanguageResolver | undefined {
        return this.resolvers.get(language);
    }

    /**
     * Get a resolver for a file based on its extension
     */
    public getResolverForFile(filePath: string): LanguageResolver | undefined {
        const ext = path.extname(filePath).toLowerCase();
        return this.extensionMap.get(ext);
    }

    /**
     * Get all registered resolvers
     */
    public getAllResolvers(): LanguageResolver[] {
        return Array.from(this.resolvers.values());
    }

    /**
     * Get all supported file extensions
     */
    public getAllExtensions(): string[] {
        const extensions = new Set<string>();
        for (const resolver of this.resolvers.values()) {
            for (const ext of resolver.extensions) {
                extensions.add(ext.startsWith('.') ? ext : `.${ext}`);
            }
        }
        return Array.from(extensions);
    }

    /**
     * Get all source file patterns for workspace scanning
     */
    public getSourceFilePattern(): string {
        const extensions = this.getAllExtensions();
        return `**/*{${extensions.join(',')}}`;
    }

    /**
     * Initialize all resolvers with the workspace root path
     */
    public async initialize(rootPath: string): Promise<void> {
        if (this.initialized && this.rootPath === rootPath) {
            return; // Already initialized for this root
        }

        this.rootPath = rootPath;
        log(`[ResolverRegistry] Initializing ${this.resolvers.size} resolvers for root: ${rootPath}`);

        const initPromises = Array.from(this.resolvers.values()).map(async (resolver) => {
            try {
                await resolver.initialize(rootPath);
                log(`[ResolverRegistry] ✓ Initialized ${resolver.displayName}`);
            } catch (error) {
                log(`[ResolverRegistry] ✗ Failed to initialize ${resolver.displayName}: ${error}`);
            }
        });

        await Promise.all(initPromises);
        this.initialized = true;
        log(`[ResolverRegistry] Initialization complete`);
    }

    /**
     * Dispose all resolvers
     */
    public dispose(): void {
        log(`[ResolverRegistry] Disposing ${this.resolvers.size} resolvers`);
        for (const resolver of this.resolvers.values()) {
            try {
                resolver.dispose();
            } catch (error) {
                log(`[ResolverRegistry] Error disposing ${resolver.displayName}: ${error}`);
            }
        }
        this.resolvers.clear();
        this.extensionMap.clear();
        this.initialized = false;
        this.rootPath = null;
    }

    /**
     * Find the best resolver for a file
     * Checks if resolver can handle the file (some may have additional logic beyond extension)
     */
    public findResolverForFile(filePath: string): LanguageResolver | undefined {
        // First try extension-based lookup (fastest)
        const extResolver = this.getResolverForFile(filePath);
        if (extResolver && extResolver.canHandle(filePath)) {
            return extResolver;
        }

        // Fallback: check all resolvers
        for (const resolver of this.resolvers.values()) {
            if (resolver.canHandle(filePath)) {
                return resolver;
            }
        }

        return undefined;
    }

    /**
     * Check if a file is supported by any resolver
     */
    public isSupported(filePath: string): boolean {
        return this.findResolverForFile(filePath) !== undefined;
    }

    /**
     * Get all languages currently supported
     */
    public getSupportedLanguages(): string[] {
        return Array.from(this.resolvers.keys());
    }
}

// Singleton instance
let registryInstance: ResolverRegistry | null = null;

/**
 * Get the global resolver registry instance
 */
export function getResolverRegistry(): ResolverRegistry {
    if (!registryInstance) {
        registryInstance = new ResolverRegistry();
    }
    return registryInstance;
}

/**
 * Reset the global registry (mainly for testing)
 */
export function resetResolverRegistry(): void {
    if (registryInstance) {
        registryInstance.dispose();
        registryInstance = null;
    }
}



