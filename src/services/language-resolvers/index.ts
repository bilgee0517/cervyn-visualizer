/**
 * Language resolvers module
 * 
 * Exports all language resolver interfaces, base classes, and implementations
 */

export { LanguageResolver, ImportInfo, ParserInfo } from './LanguageResolver';
export { BaseLanguageResolver } from './BaseLanguageResolver';
export { ResolverRegistry, getResolverRegistry, resetResolverRegistry } from './ResolverRegistry';
export { TypeScriptResolver } from './TypeScriptResolver';
export { PythonResolver } from './PythonResolver';
export { GoResolver } from './GoResolver';
export { JavaResolver } from './JavaResolver';
export { RustResolver } from './RustResolver';

import { getResolverRegistry } from './ResolverRegistry';
import { TypeScriptResolver } from './TypeScriptResolver';
import { PythonResolver } from './PythonResolver';
import { GoResolver } from './GoResolver';
import { JavaResolver } from './JavaResolver';
import { RustResolver } from './RustResolver';
import { log } from '../../logger';

/**
 * Initialize and register all default language resolvers
 */
export async function initializeDefaultResolvers(rootPath: string): Promise<void> {
    const registry = getResolverRegistry();
    
    // Register TypeScript/JavaScript resolver
    const tsResolver = new TypeScriptResolver();
    registry.register(tsResolver);
    
    // Register Python resolver
    const pythonResolver = new PythonResolver();
    registry.register(pythonResolver);
    
    // Register Go resolver
    const goResolver = new GoResolver();
    registry.register(goResolver);
    
    // Register Java resolver
    const javaResolver = new JavaResolver();
    registry.register(javaResolver);
    
    // Register Rust resolver
    const rustResolver = new RustResolver();
    registry.register(rustResolver);
    
    // Initialize all resolvers
    await registry.initialize(rootPath);
    
    log(`[LanguageResolvers] Registered ${registry.getAllResolvers().length} language resolvers`);
}

