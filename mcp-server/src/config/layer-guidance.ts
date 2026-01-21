/**
 * Layer Guidance System
 * 
 * Provides AI agents with clear guidance on what each layer represents,
 * recommended node/edge types, and usage examples.
 */

import { Layer } from '../graph-state-manager.js';

export interface LayerGuidance {
    name: string;
    purpose: string;
    description: string;
    recommendedNodeTypes: string[];
    recommendedEdgeTypes: string[];
    examples: string[];
    useCases: string[];
    warnings: string[];
    // NEW: Enhanced guidance for AI agents
    whatToInclude: string[];  // What nodes should be added to this layer
    whatToAvoid: string[];    // What should NOT be in this layer
    nodeTypeMapping: Record<string, string>; // Maps node type to its visual style/shape
    strictValidation: boolean; // If true, only allow recommended types
}

/**
 * Complete layer guidance for all 5 layers
 */
export const LAYER_GUIDANCE: Record<Layer, LayerGuidance> = {
    workflow: {
        name: 'Workflow Layer',
        purpose: 'Feature mapping and user journey tracking',
        description: 'Map features, user journeys, and their product-level dependencies. Use supportedBy to trace which code/services implement each feature. Focus on product semantics, not technical implementation.',
        recommendedNodeTypes: [
            'feature',          // Primary: user-facing capability
            'feature-group',    // Container for related features
            'user-journey'      // User flow through multiple features (works great as compound node)
        ],
        recommendedEdgeTypes: [
            'depends-on-feature',  // Feature A depends on Feature B (clearer than "requires")
            'part-of',             // Feature is part of feature-group (clearer than "composed-of")
            'primary-flow',        // Main journey step ordering (A → B in primary path)
            'alternate-flow'       // Variant paths or edge cases (error flows, optional steps)
        ],
        examples: [
            '"User Authentication" feature',
            '"Payment Flow" feature-group containing "Payment Processing", "Refunds", "Receipts"',
            '"Search" feature with supportedBy links to SearchService and search.ts',
            '"User Registration" user-journey as compound node containing "Email Entry" → "Password Setup" → "Email Verification" features connected via primary-flow edges',
            '"Checkout Flow" user-journey with primary-flow for happy path and alternate-flow for error handling'
        ],
        useCases: [
            'Map features and their product dependencies',
            'Trace which code implements which features (via supportedBy)',
            'Model user journeys as compound nodes containing feature steps',
            'Show primary vs alternate flows through the system',
            'Find all code related to a specific feature or journey',
            'Identify unimplemented or partially implemented features',
            'Analyze feature dependency chains without technical details'
        ],
        warnings: [
            'Use supportedBy array to link features to implementation nodes (container/component/code layers)',
            'Avoid implementation details here - focus on feature-level concepts',
            'Use feature-group for grouping related features, not for epics/stories',
            'Use user-journey as compound nodes with features as children',
            'Edge types are PRODUCT SEMANTICS only - use primary-flow/alternate-flow for sequencing, depends-on-feature for dependencies',
            'Do NOT use technical edge types like "calls" or "imports" here'
        ],
        whatToInclude: [
            'User-facing capabilities and features (e.g., "User Login", "Search Products", "Checkout")',
            'Feature groups for related capabilities (e.g., "E-commerce", "Authentication")',
            'User journeys as compound nodes showing flow through features',
            'Feature dependencies (what depends on what)',
            'Primary and alternate flows between features',
            'Link features to their implementation via supportedBy array'
        ],
        whatToAvoid: [
            'Technical implementation details (use code/component layers instead)',
            'Specific files, classes, or functions',
            'External systems (use context layer)',
            'Services and APIs (use container layer)',
            'Code-level dependencies',
            'Technical edge types (imports, calls, etc.)',
            'Epics, stories, or other project management concepts'
        ],
        nodeTypeMapping: {
            'feature': 'hexagon (bold border, medium size)',
            'feature-group': 'round-rectangle with dashed border (compound node)',
            'user-journey': 'round-rectangle with bold border (compound node for journey steps)'
        },
        strictValidation: true  // Only allow feature, feature-group, user-journey
    },
    
    context: {
        name: 'Context Layer',
        purpose: 'External systems, actors, and boundary interactions',
        description: 'Define external dependencies, actors, and system boundaries. Focus on boundary interactions using specific edge types (C4 Level 1).',
        recommendedNodeTypes: [
            'actor',               // People, users, roles, personas
            'external-system',     // Generic external systems
            'external-api',        // External REST/GraphQL APIs
            'external-datastore',  // External databases, caches, data warehouses
            'external-service'     // SaaS services (Auth0, Stripe, Twilio, SendGrid)
        ],
        recommendedEdgeTypes: [
            'uses',                  // Actor uses system (human interaction)
            'integrates-with',       // Bidirectional system integration
            'authenticates-with',    // Authentication relationships
            'reads-from',            // Data reading from external source
            'writes-to',             // Data writing to external target
            'sends-event-to',        // Event publishing to external system
            'receives-event-from'    // Event subscription from external system
        ],
        examples: [
            '"Admin User" actor who uses the system',
            '"Stripe API" external-api for payment processing',
            '"PostgreSQL Database" external-datastore (if externally managed)',
            '"Auth0" external-service for authentication',
            '"Customer" actor --uses--> "Web App"',
            '"Payment Service" --integrates-with--> "Stripe API"',
            '"Order Service" --sends-event-to--> "Event Bus"',
            '"Notification Service" --receives-event-from--> "Event Bus"'
        ],
        useCases: [
            'Document external API dependencies',
            'Map SaaS service integrations (Stripe, Auth0, Twilio)',
            'Show system boundaries and interfaces',
            'Identify actors and their interactions',
            'Model event-based integrations',
            'Plan integration points with specific edge semantics',
            'Trace data flows across system boundaries'
        ],
        warnings: [
            'STRICT VALIDATION ENABLED - Only use recommended node types',
            'Only for EXTERNAL systems and actors (not internal services)',
            'Use specific edge types - avoid generic "depends-on" (too vague for boundaries)',
            'Use supportsFeatures to show which features need which external systems',
            'actor = any person, user, role, or persona (replaced person/user-role)',
            'external-datastore = databases, caches (if externally managed)',
            'external-service = SaaS services (Auth0, Stripe, Twilio, SendGrid)',
            'For event flows: use sends-event-to/receives-event-from instead of generic edges'
        ],
        whatToInclude: [
            'Actors: users, roles, personas who interact with the system (Admin, Customer, Developer)',
            'External APIs: REST/GraphQL APIs (Stripe, SendGrid, Google Maps, Weather API)',
            'SaaS Services: Auth0, Twilio, AWS S3, Cloudinary, Mailgun',
            'External datastores: databases/caches NOT managed by you (managed PostgreSQL, Redis Cloud)',
            'External systems: other systems your system integrates with',
            'Event sources/sinks: external event buses, message brokers',
            'Boundary interactions: use specific edge types (reads-from, writes-to, sends-event-to, etc.)'
        ],
        whatToAvoid: [
            'Internal services/applications (use container layer instead)',
            'Internal code modules (use component layer instead)',
            'Implementation files (use code layer instead)',
            'Features and capabilities (use workflow layer instead)',
            'Infrastructure YOU manage (use container layer for your own databases/services)',
            'Generic "depends-on" edges (use specific: reads-from, writes-to, integrates-with, etc.)',
            'Mixing old types: person, user-role, database, third-party-service (use new types)'
        ],
        nodeTypeMapping: {
            'actor': 'ellipse (human/role icon, teal color)',
            'external-system': 'round-rectangle (rose/gray background)',
            'external-api': 'round-rectangle (pink accent, API indicator)',
            'external-datastore': 'cylinder shape (yellow, data storage)',
            'external-service': 'round-rectangle (rose light, cloud/SaaS indicator)'
        },
        strictValidation: true  // ENABLED: Only allow recommended types
    },
    
    container: {
        name: 'Container Layer',
        purpose: 'Runtime + data ownership architecture',
        description: 'Define deployable units and their runtime interactions. Use specific edge types that show sync vs async operations and where state lives (C4 Level 2).',
        recommendedNodeTypes: [
            'frontend',        // Web apps, mobile apps, SPAs (client-facing)
            'service',         // Backend services, APIs, microservices
            'worker',          // Background job processors, async workers
            'gateway',         // API gateways, edge routers, load balancers
            'message-broker',  // Event buses (Kafka, RabbitMQ, NATS)
            'datastore',       // Databases you own (PostgreSQL, MySQL, MongoDB)
            'cache',           // In-memory caches (Redis, Memcached)
            'object-store'     // Blob storage you own (S3, MinIO, Azure Blob)
        ],
        recommendedEdgeTypes: [
            // Synchronous operations (blocking)
            'http-request',    // REST/HTTP call (sync request-response)
            'rpc-call',        // gRPC/RPC call (sync)
            'db-query',        // Database query (sync read/write)
            'cache-read',      // Cache lookup (sync)
            'cache-write',     // Cache update (sync)
            // Asynchronous operations (non-blocking)
            'publish-event',   // Publish to message broker (fire and forget)
            'consume-event',   // Subscribe/consume from broker (event-driven)
            'enqueue-job',     // Add job to worker queue (async processing)
            // Data flow (replication/sync)
            'replicates-to',   // Data replication (primary → replica)
            'syncs-with'       // Bidirectional data synchronization
        ],
        examples: [
            '"Web Frontend" frontend --http-request--> "API Gateway" gateway',
            '"API Gateway" gateway --rpc-call--> "Auth Service" service',
            '"Order Service" service --db-query--> "PostgreSQL" datastore',
            '"Order Service" service --publish-event--> "Event Bus" message-broker',
            '"Event Bus" message-broker --consume-event--> "Notification Worker" worker',
            '"API Service" service --cache-read--> "Redis Cache" cache',
            '"API Service" service --cache-write--> "Redis Cache" cache',
            '"Upload Service" service --enqueue-job--> "Image Worker" worker',
            '"PostgreSQL Primary" datastore --replicates-to--> "PostgreSQL Replica" datastore',
            '"User Service" service --syncs-with--> "Search Index" datastore'
        ],
        useCases: [
            'Visualize runtime request flows (sync vs async)',
            'Identify data ownership boundaries (which service owns which DB)',
            'Map event-driven architectures (pub/sub patterns)',
            'Show caching strategies and cache invalidation paths',
            'Document background job processing flows',
            'Trace synchronous dependencies for latency analysis',
            'Plan database replication and failover strategies',
            'Identify scaling bottlenecks (sync vs async operations)'
        ],
        warnings: [
            'STRICT VALIDATION ENABLED - Only use runtime-specific edge types',
            'Use for deployable units and runtime infrastructure only',
            'NO generic edges allowed: "calls" → use "http-request" or "rpc-call"',
            'NO generic edges allowed: "depends-on" → use specific runtime verb',
            'Edge types must show WHAT HAPPENS AT RUNTIME (not just dependencies)',
            'Sync edges (http-request, rpc-call, db-query) = blocking operations',
            'Async edges (publish-event, consume-event, enqueue-job) = non-blocking operations',
            'frontend = any client app (web, mobile, desktop)',
            'service = any backend API or microservice',
            'worker = background job processor (not user-facing)',
            'datastore/cache/object-store = state ownership (who owns the data?)',
            'Tag with supportsFeatures to trace features to runtime containers'
        ],
        whatToInclude: [
            'Client applications: web apps, mobile apps, desktop apps (use "frontend")',
            'Backend services: REST APIs, GraphQL APIs, microservices (use "service")',
            'Background workers: job processors, async task handlers (use "worker")',
            'Infrastructure: API gateways, load balancers, edge routers (use "gateway")',
            'Message brokers: Kafka, RabbitMQ, NATS, AWS SQS (use "message-broker")',
            'Databases YOU OWN: PostgreSQL, MySQL, MongoDB (use "datastore")',
            'Caches: Redis, Memcached, in-memory caches (use "cache")',
            'Object storage YOU OWN: S3 buckets, MinIO, Azure Blob (use "object-store")',
            'Runtime relationships: use specific verbs (http-request, publish-event, db-query, etc.)'
        ],
        whatToAvoid: [
            'External third-party services NOT deployed by you (use context layer instead)',
            'Internal code modules/packages (use component layer instead)',
            'Specific files or classes (use code layer instead)',
            'Features and capabilities (use workflow layer instead)',
            'Generic edge types: "calls", "depends-on", "uses" (use runtime-specific verbs)',
            'Mixed sync/async semantics: be explicit about blocking vs non-blocking',
            'Infrastructure you do NOT manage (SaaS services → context layer)'
        ],
        nodeTypeMapping: {
            'frontend': 'round-rectangle (cyan, browser/phone icon)',
            'service': 'round-rectangle (green, server icon)',
            'worker': 'round-rectangle (orange, gear/worker icon)',
            'gateway': 'round-rectangle (blue, gateway icon)',
            'message-broker': 'round-rectangle (purple, event bus icon)',
            'datastore': 'cylinder (yellow, database icon)',
            'cache': 'round-rectangle (red, lightning/cache icon)',
            'object-store': 'round-rectangle (gray, bucket/storage icon)'
        },
        strictValidation: true  // ENABLED: Force runtime-specific types
    },
    
    component: {
        name: 'Component Layer',
        purpose: 'Internal components and modules',
        description: 'Define logical groupings within containers. Show modules, packages, and major code components (C4 Level 3).',
        recommendedNodeTypes: [
            'module',
            'package',
            'component',
            'library',
            'namespace',
            'plugin'
        ],
        recommendedEdgeTypes: [
            'imports',
            'depends-on',
            'extends',
            'implements',
            'uses'
        ],
        examples: [
            '"auth-module" module',
            '"@company/utils" package',
            '"UserManagement" component',
            '"payment-processor" library'
        ],
        useCases: [
            'Organize code into logical groups',
            'Document internal module structure',
            'Show package dependencies',
            'Plan refactoring and module boundaries',
            'Identify reusable components'
        ],
        warnings: [
            'Use for logical groupings, not individual files',
            'Tag with supportsFeatures to trace features to modules',
            'Consider using for npm packages and major subsystems'
        ],
        whatToInclude: [
            'NPM packages and modules (@myapp/auth, @myapp/payments)',
            'Code components and UI components (Button, UserProfile, PaymentForm)',
            'Reusable libraries (logger, http-client, validation)',
            'Domain modules (user-management, order-processing)',
            'Shared utilities and helpers',
            'Plugin systems and extensions',
            'Namespaces and logical groupings of code'
        ],
        whatToAvoid: [
            'Individual files (use code layer)',
            'Classes and functions (use code layer)',
            'Deployable applications (use container layer)',
            'External dependencies (use context layer)',
            'Features (use workflow layer)'
        ],
        nodeTypeMapping: {
            'module': 'round-rectangle (module indicator)',
            'package': 'round-rectangle (package icon)',
            'component': 'round-rectangle (component icon)',
            'library': 'round-rectangle (library indicator)',
            'namespace': 'round-rectangle with dashed border (logical grouping)',
            'plugin': 'round-rectangle (plugin icon)'
        },
        strictValidation: false
    },
    
    code: {
        name: 'Code Layer',
        purpose: 'Detailed implementation (files, classes, functions)',
        description: 'Auto-populated with detailed code structure. AI can add conceptual nodes to explain patterns (C4 Level 4).',
        recommendedNodeTypes: [
            'file',
            'directory',
            'class',
            'function',
            'interface',
            'type',
            'concept'  // AI-added conceptual node
        ],
        recommendedEdgeTypes: [
            'imports',
            'calls',
            'extends',
            'implements',
            'uses'
        ],
        examples: [
            '"UserController.ts" file',
            '"User" class',
            '"authenticateUser" function',
            '"IUserRepository" interface'
        ],
        useCases: [
            'Navigate detailed code structure (auto-populated)',
            'Add conceptual nodes to explain patterns',
            'Annotate code with architectural concepts',
            'Tag with supportsFeatures for feature tracing',
            'Document code organization'
        ],
        warnings: [
            'This layer is mostly auto-populated from code analysis',
            'AI can add conceptual nodes to explain patterns',
            'Use supportsFeatures to link files to features',
            'Avoid duplicating auto-generated nodes'
        ],
        whatToInclude: [
            'Source code files (.ts, .tsx, .js, .jsx, .py, .java)',
            'Directories and folder structure',
            'Classes and interfaces',
            'Functions and methods',
            'Important configuration files (package.json, tsconfig.json)',
            'Entry points (index.ts, main.ts, App.tsx)',
            'Test files if relevant to understanding structure'
        ],
        whatToAvoid: [
            'Generated files (dist/, build/, node_modules/)',
            'Binary files and images',
            'Temporary files',
            'IDE-specific files (.vscode/, .idea/)',
            'Git files (.git/)',
            'Trivial utility files unless they\'re core to understanding'
        ],
        nodeTypeMapping: {
            'file': 'round-rectangle (small, file indicator)',
            'directory': 'round-rectangle with dashed border (large, compound node)',
            'class': 'round-rectangle (purple accent, class icon)',
            'function': 'round-rectangle (small, function indicator)',
            'interface': 'round-rectangle (interface indicator)',
            'type': 'round-rectangle (type indicator)',
            'concept': 'round-rectangle (abstract concept)'
        },
        strictValidation: true
    }
};

/**
 * Get guidance for a specific layer
 */
export function getLayerGuidance(layer: Layer): LayerGuidance {
    return LAYER_GUIDANCE[layer];
}

/**
 * Check if a node type is recommended for a layer
 */
export function isNodeTypeRecommended(layer: Layer, nodeType: string): boolean {
    const guidance = LAYER_GUIDANCE[layer];
    return guidance.recommendedNodeTypes.includes(nodeType);
}

/**
 * Check if an edge type is recommended for a layer
 */
export function isEdgeTypeRecommended(layer: Layer, edgeType: string): boolean {
    const guidance = LAYER_GUIDANCE[layer];
    return guidance.recommendedEdgeTypes.includes(edgeType);
}

/**
 * Get suggested layer for a node type
 */
export function suggestLayerForNodeType(nodeType: string): Layer | null {
    for (const [layer, guidance] of Object.entries(LAYER_GUIDANCE)) {
        if (guidance.recommendedNodeTypes.includes(nodeType)) {
            return layer as Layer;
        }
    }
    return null;
}

/**
 * Get all recommended node types across all layers
 */
export function getAllRecommendedNodeTypes(): Record<Layer, string[]> {
    const result: Record<Layer, string[]> = {} as any;
    for (const [layer, guidance] of Object.entries(LAYER_GUIDANCE)) {
        result[layer as Layer] = guidance.recommendedNodeTypes;
    }
    return result;
}

/**
 * Get all recommended edge types across all layers
 */
export function getAllRecommendedEdgeTypes(): Record<Layer, string[]> {
    const result: Record<Layer, string[]> = {} as any;
    for (const [layer, guidance] of Object.entries(LAYER_GUIDANCE)) {
        result[layer as Layer] = guidance.recommendedEdgeTypes;
    }
    return result;
}
