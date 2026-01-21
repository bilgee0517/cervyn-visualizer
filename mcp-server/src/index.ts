/**
 * Codebase Visualizer MCP Server
 * 
 * This MCP server exposes knowledge graph manipulation tools to AI agents.
 * It manages graph state and provides tools for:
 * - Getting current graph data
 * - Updating node properties
 * - Updating edge properties
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { GraphStateManager } from './graph-state-manager.js';
import { MCP_FUNCTION_IDS } from './mcp-function-ids.js';
import * as tools from './tools/index.js';
import { 
  GetGraphArgsSchema, 
  AddNodeArgsSchema,
  DeleteNodeArgsSchema,
  AddEdgeArgsSchema,
  DeleteEdgeArgsSchema,
  UpdateNodeArgsSchema, 
  UpdateEdgeArgsSchema,
  formatValidationError 
} from './validation/schemas.js';
import {
  BatchNodesArgsSchema,
  BatchEdgesArgsSchema,
  QueryNodesArgsSchema,
  QueryEdgesArgsSchema,
  GetGraphFilteredArgsSchema,
  TraverseGraphArgsSchema,
  CreateCompoundNodeArgsSchema,
  AddChildNodesArgsSchema,
  RemoveChildNodesArgsSchema,
  MoveNodesArgsSchema,
  GetCompoundHierarchyArgsSchema,
  ToggleCompoundCollapseArgsSchema,
  ConvertToCompoundArgsSchema
} from './validation/query-schemas.js';
import { ZodError } from 'zod';

// Initialize graph state manager
const graphState = new GraphStateManager();

// Create MCP server instance
const server = new Server(
  {
    name: 'codebase-visualizer-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Define all available tools
 */
const TOOLS: Tool[] = [
  {
    name: MCP_FUNCTION_IDS.GET_GRAPH,
    description: 'Get the current graph data (nodes and edges) with layer metadata including purpose, recommended types, and usage guidance',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Which layer to retrieve (default: current layer)',
        },
      },
    },
  },
  {
    name: MCP_FUNCTION_IDS.ADD_NODE,
    description: `Add a new node to a specific graph layer. Use this to create architectural concepts, dependency nodes, or other AI-generated nodes.

IMPORTANT: Always provide a detailed roleDescription for nodes. This appears in tooltips and helps developers understand the node's purpose at a glance.

LAYER GUIDE (5 Layers):
• workflow: Features, user journeys, capabilities (e.g., "User Login", "Create Post")
• context: Actors, external systems, APIs, datastores, services (e.g., "Admin User", "Stripe API", "PostgreSQL", "Auth0")
  - actor: people, users, roles, personas
  - external-system: generic external systems
  - external-api: REST/GraphQL APIs
  - external-datastore: databases, caches, data warehouses
  - external-service: SaaS services (Auth0, Stripe, Twilio)
• container: Applications, services, subsystems (e.g., "Auth Service", "Web App")
• component: Modules, packages, components (e.g., "auth-module", "@company/utils")
• code: Files, classes, functions (auto-populated, but AI can add concepts)

DESCRIPTION GUIDELINES:
• roleDescription: 1-2 sentences explaining what this node does, its purpose, and key responsibilities
  - workflow nodes: "Allows users to authenticate using email/password. Handles login, session creation, and token generation."
  - context nodes: "Third-party payment processing service. Handles credit card transactions, subscriptions, and webhooks."
  - container nodes: "Backend REST API service that handles user authentication, authorization, and session management. Built with Express.js."
  - component nodes: "Shared validation library used across services. Provides schema validation, input sanitization, and error formatting."
• technology: Specify the tech stack (e.g., "Express.js + TypeScript", "React 18", "PostgreSQL 15")

FEATURE ANNOTATIONS:
Nodes can include 'supportsFeatures' array to link to workflow layer features.
Workflow nodes can include 'supportedBy' array to trace implementation.

Use layer parameter to target specific abstraction level. Defaults to current layer.`,
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Display label for the node',
        },
        type: {
          type: 'string',
          description: 'Node type (e.g., "architectural-component", "external-dependency", "file")',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Layer to add the node to (default: current layer)',
        },
        roleDescription: {
          type: 'string',
          description: 'STRONGLY RECOMMENDED: 1-2 sentence description of what this node does, its purpose, and key responsibilities. Appears in tooltips and helps developers understand the architecture at a glance.',
        },
        technology: {
          type: 'string',
          description: 'Technology or framework (optional)',
        },
        path: {
          type: 'string',
          description: 'File path if this is a file node (optional)',
        },
        parent: {
          type: 'string',
          description: 'Parent node ID for compound nodes (optional)',
        },
        supportsFeatures: {
          type: 'array',
          items: { type: 'string' },
          description: 'Feature IDs this node supports (for all layers except workflow)',
        },
        supportedBy: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs implementing this feature (for workflow layer only)',
        },
      },
      required: ['label', 'type'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.DELETE_NODE,
    description: 'Delete a node from a specific layer. This also removes all connected edges.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'ID of the node to delete',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Layer to delete from (default: current layer)',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.ADD_EDGE,
    description: `Add an edge between nodes. Nodes can be in different layers (cross-layer edges).

IMPORTANT: Always provide a description for edges. This appears in tooltips and helps developers understand the relationship at a glance.

EDGE DESCRIPTION GUIDELINES:
• Be specific about what flows through this edge (data, events, calls, etc.)
• Mention key details like protocols, data formats, or frequency
• Examples:
  - http-request: "REST API call to fetch user profile. Returns JSON with user data, roles, and preferences."
  - publish-event: "Publishes 'order.created' event with order ID, customer info, and items. Consumed by inventory and notification services."
  - db-query: "Queries users table by email. Returns user record with hashed password for authentication."
  - reads-from: "Pulls customer subscription data via Stripe API. Synced every 5 minutes."
  - authenticates-with: "OAuth 2.0 authentication flow. Exchanges authorization code for access token."

Use edgeType to specify the relationship semantics (see edge type enum for options).`,
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: {
          type: 'string',
          description: 'Source node ID',
        },
        targetId: {
          type: 'string',
          description: 'Target node ID',
        },
        edgeType: {
          type: 'string',
          enum: ['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses', 'depends-on-feature', 'part-of', 'primary-flow', 'alternate-flow', 'triggers', 'authenticates-with', 'reads-from', 'writes-to', 'sends-event-to', 'receives-event-from', 'integrates-with', 'sends-data-to', 'receives-data-from', 'publishes-to', 'subscribes-to', 'synchronizes-with', 'http-request', 'rpc-call', 'db-query', 'cache-read', 'cache-write', 'publish-event', 'consume-event', 'enqueue-job', 'replicates-to', 'syncs-with'],
          description: 'Edge type - specifies the relationship semantics (sync/async, data flow, etc.)',
        },
        label: {
          type: 'string',
          description: 'Short edge label (optional) - e.g., "getUserProfile", "order.created", "users table"',
        },
        description: {
          type: 'string',
          description: 'STRONGLY RECOMMENDED: 1-2 sentence description of what flows through this edge, including protocols, data formats, or key details. Appears in tooltips.',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Layer to store the edge in (default: current layer)',
        },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.DELETE_EDGE,
    description: 'Delete an edge from a specific layer.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: 'ID of the edge to delete',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Layer to delete from (default: current layer)',
        },
      },
      required: ['edgeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.UPDATE_NODE,
    description: 'Update properties of an existing node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Node ID to update',
        },
        label: {
          type: 'string',
          description: 'New label (optional)',
        },
        roleDescription: {
          type: 'string',
          description: 'New role description (optional)',
        },
        technology: {
          type: 'string',
          description: 'New technology (optional)',
        },
        progressStatus: {
          type: 'string',
          enum: ['done', 'in-progress', 'not-started', 'error'],
          description: 'Progress status (optional)',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Which layer (default: current layer)',
        },
        supportsFeatures: {
          type: 'array',
          items: { type: 'string' },
          description: 'Feature IDs this node supports (for all layers except workflow)',
        },
        supportedBy: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs implementing this feature (for workflow layer only)',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.UPDATE_EDGE,
    description: 'Update properties of an existing edge. Use this to add/update descriptions, change edge types, or modify labels.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: 'Edge ID to update',
        },
        label: {
          type: 'string',
          description: 'New edge label (optional) - short name like "getUserProfile", "order.created"',
        },
        edgeType: {
          type: 'string',
          enum: ['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses', 'depends-on-feature', 'part-of', 'primary-flow', 'alternate-flow', 'triggers', 'authenticates-with', 'reads-from', 'writes-to', 'sends-event-to', 'receives-event-from', 'integrates-with', 'sends-data-to', 'receives-data-from', 'publishes-to', 'subscribes-to', 'synchronizes-with', 'http-request', 'rpc-call', 'db-query', 'cache-read', 'cache-write', 'publish-event', 'consume-event', 'enqueue-job', 'replicates-to', 'syncs-with'],
          description: 'New edge type (optional)',
        },
        description: {
          type: 'string',
          description: 'RECOMMENDED: 1-2 sentence description of what flows through this edge. Include protocols, data formats, and key details. Appears in tooltips.',
        },
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Which layer (default: current layer)',
        },
      },
      required: ['edgeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.DESCRIBE_LAYER,
    description: 'Get detailed information about a specific layer including its purpose, recommended usage, examples, and use cases',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['workflow', 'context', 'container', 'component', 'code'],
          description: 'Which layer to describe',
        },
      },
      required: ['layer'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.BATCH_NODES,
    description: `Batch process multiple node operations (add, update, delete) in a single transaction.

Benefits:
- Single validation pass
- Single file write (vs N writes)
- Atomic operations (all succeed or all fail, if atomic=true)
- 50x faster for bulk operations

Example:
{
  "operations": [
    { "action": "add", "node": { "label": "AuthService", "type": "service" } },
    { "action": "update", "nodeId": "node-123", "updates": { "technology": "Express.js" } },
    { "action": "delete", "nodeId": "node-456" }
  ],
  "atomic": true
}`,
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of node operations to perform',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'update', 'delete'] },
              nodeId: { type: 'string', description: 'Required for update/delete' },
              node: {
                type: 'object',
                description: 'Required for add',
                properties: {
                  label: { type: 'string' },
                  type: { type: 'string' },
                  roleDescription: { type: 'string' },
                  technology: { type: 'string' },
                  path: { type: 'string' },
                  parent: { type: 'string' },
                  supportsFeatures: { type: 'array', items: { type: 'string' } },
                  supportedBy: { type: 'array', items: { type: 'string' } }
                }
              },
              updates: { type: 'object', description: 'Required for update' }
            }
          }
        },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        atomic: { type: 'boolean', default: true, description: 'If true, all operations succeed or all fail' }
      },
      required: ['operations']
    }
  },
  {
    name: MCP_FUNCTION_IDS.BATCH_EDGES,
    description: `Batch process multiple edge operations (add, update, delete) in a single transaction.

Same benefits as batchNodes but for edges.`,
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of edge operations to perform',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'update', 'delete'] },
              edgeId: { type: 'string', description: 'Required for update/delete' },
              edge: {
                type: 'object',
                description: 'Required for add',
                properties: {
                  sourceId: { type: 'string' },
                  targetId: { type: 'string' },
                  edgeType: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' }
                }
              },
              updates: { type: 'object', description: 'Required for update' }
            }
          }
        },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        atomic: { type: 'boolean', default: true }
      },
      required: ['operations']
    }
  },
  {
    name: MCP_FUNCTION_IDS.QUERY_NODES,
    description: `Search and filter nodes with advanced query capabilities.

Benefits:
- Load only what you need (50 nodes instead of 1000+)
- Fast indexed lookups (O(1) for types, features)
- Pagination for large results
- Pattern matching on labels

Filter options:
- nodeTypes: Filter by types (e.g., ['file', 'class'])
- labelPattern: Regex pattern (e.g., 'Auth.*')
- labelPrefix: Fast prefix search (e.g., 'Auth')
- supportsFeatures: Nodes supporting these features
- technology, progressStatus, isAgentAdded
- Pagination: limit, offset

Example:
{
  "filter": {
    "nodeTypes": ["file", "class"],
    "labelPattern": "Auth.*",
    "supportsFeatures": ["feature-login"],
    "limit": 50,
    "offset": 0
  }
}`,
    inputSchema: {
      type: 'object',
      properties: {
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        filter: {
          type: 'object',
          properties: {
            nodeTypes: { type: 'array', items: { type: 'string' } },
            nodeIds: { type: 'array', items: { type: 'string' } },
            labelPattern: { type: 'string' },
            labelPrefix: { type: 'string' },
            supportsFeatures: { type: 'array', items: { type: 'string' } },
            supportedBy: { type: 'array', items: { type: 'string' } },
            technology: { type: 'string' },
            progressStatus: { type: 'string', enum: ['done', 'in-progress', 'not-started', 'error'] },
            isAgentAdded: { type: 'boolean' },
            limit: { type: 'number', minimum: 1, maximum: 1000 },
            offset: { type: 'number', minimum: 0 }
          }
        },
        includeEdges: { type: 'boolean', default: false }
      }
    }
  },
  {
    name: MCP_FUNCTION_IDS.QUERY_EDGES,
    description: 'Query and filter edges by type, source/target nodes, and label patterns',
    inputSchema: {
      type: 'object',
      properties: {
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        filter: {
          type: 'object',
          properties: {
            edgeTypes: { type: 'array', items: { type: 'string' } },
            sourceIds: { type: 'array', items: { type: 'string' } },
            targetIds: { type: 'array', items: { type: 'string' } },
            labelPattern: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 1000 },
            offset: { type: 'number', minimum: 0 }
          }
        }
      }
    }
  },
  {
    name: MCP_FUNCTION_IDS.TRAVERSE_GRAPH,
    description: `Traverse the graph using various algorithms.

Operations:
- neighbors: Find direct connections (depth 1-10)
- path: Find shortest path between two nodes (BFS)
- subgraph: Extract connected subgraph from a starting point
- bfs: Breadth-first search traversal
- dfs: Depth-first search traversal

Features:
- Direction: incoming, outgoing, or both
- Depth control: limit traversal depth
- Filters: edge types, node types

Use cases:
- "What files does AuthService import?" (neighbors, outgoing, depth 1)
- "How does UserController reach DatabaseClient?" (path)
- "Show me the auth feature cluster" (subgraph, depth 2)

Example:
{
  "operation": "neighbors",
  "startNodeId": "file-AuthService",
  "direction": "outgoing",
  "depth": 2,
  "filter": { "edgeTypes": ["imports", "calls"] }
}`,
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['neighbors', 'path', 'subgraph', 'bfs', 'dfs'] },
        startNodeId: { type: 'string' },
        endNodeId: { type: 'string', description: 'Required for path operation' },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'], default: 'both' },
        depth: { type: 'number', minimum: 1, maximum: 10, default: 1 },
        filter: {
          type: 'object',
          properties: {
            edgeTypes: { type: 'array', items: { type: 'string' } },
            nodeTypes: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['operation', 'startNodeId']
    }
  },
  {
    name: MCP_FUNCTION_IDS.CREATE_COMPOUND_NODE,
    description: `Create a compound node (parent node that can contain other nodes).

Compound nodes are containers useful for:
- Folder/file hierarchies
- Logical groupings (feature clusters)
- Namespaces (package structures)

Example:
{
  "label": "Authentication Module",
  "type": "module",
  "groupType": "logical",
  "roleDescription": "Handles all authentication logic"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        type: { type: 'string', default: 'folder' },
        groupType: { type: 'string', enum: ['folder', 'logical', 'namespace', 'file'], default: 'logical' },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        roleDescription: { type: 'string' },
        technology: { type: 'string' },
        parent: { type: 'string' },
        isCollapsed: { type: 'boolean', default: false },
        supportsFeatures: { type: 'array', items: { type: 'string' } },
        supportedBy: { type: 'array', items: { type: 'string' } }
      },
      required: ['label']
    }
  },
  {
    name: MCP_FUNCTION_IDS.ADD_CHILD_NODES,
    description: `Add child nodes to a compound node.

Automatically:
- Updates parent node's children list
- Sets child nodes' parent reference
- Removes children from old parent if needed

Example:
{
  "parentId": "module-auth",
  "childIds": ["file-AuthService", "file-UserController"]
}`,
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        childIds: { type: 'array', items: { type: 'string' } },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] }
      },
      required: ['parentId', 'childIds']
    }
  },
  {
    name: MCP_FUNCTION_IDS.REMOVE_CHILD_NODES,
    description: 'Remove child nodes from a compound node. Children become root nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        childIds: { type: 'array', items: { type: 'string' } },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] }
      },
      required: ['parentId', 'childIds']
    }
  },
  {
    name: MCP_FUNCTION_IDS.MOVE_NODES,
    description: `Move nodes to a different parent or remove from parent.

Use cases:
- Reorganize hierarchy
- Move nodes between folders
- Promote nodes to root level (set targetParentId to null)

Example:
{
  "nodeIds": ["file-helper-1", "file-helper-2"],
  "targetParentId": "folder-utils"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' } },
        targetParentId: { type: ['string', 'null'] },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] }
      },
      required: ['nodeIds', 'targetParentId']
    }
  },
  {
    name: MCP_FUNCTION_IDS.GET_COMPOUND_HIERARCHY,
    description: `Get compound node hierarchy (parent-child tree).

Returns nested structure with:
- Node info (id, label, type)
- Child count and list
- Collapse state
- Depth level

Example:
{
  "rootNodeId": "module-auth",  // Optional: specific root, or all roots if omitted
  "maxDepth": 10
}`,
    inputSchema: {
      type: 'object',
      properties: {
        rootNodeId: { type: 'string' },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] },
        maxDepth: { type: 'number', minimum: 1, maximum: 20, default: 10 }
      }
    }
  },
  {
    name: MCP_FUNCTION_IDS.TOGGLE_COMPOUND_COLLAPSE,
    description: 'Toggle or set the collapse state of a compound node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        isCollapsed: { type: 'boolean' },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] }
      },
      required: ['nodeId']
    }
  },
  {
    name: MCP_FUNCTION_IDS.CONVERT_TO_COMPOUND,
    description: `Convert a regular node to a compound node.

Useful when you want to add children to an existing node.

Example:
{
  "nodeId": "service-api",
  "groupType": "logical"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        groupType: { type: 'string', enum: ['folder', 'logical', 'namespace', 'file'], default: 'logical' },
        layer: { type: 'string', enum: ['workflow', 'context', 'container', 'component', 'code'] }
      },
      required: ['nodeId']
    }
  }
];

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

/**
 * Handle tool calls with validation
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    let validatedArgs: any;
    let result: any;

    // Validate arguments based on tool type
    switch (name) {
      case MCP_FUNCTION_IDS.GET_GRAPH:
        // Check if using new filtered version (has filter or summaryOnly)
        if (args && (args.filter || args.summaryOnly !== undefined)) {
          validatedArgs = GetGraphFilteredArgsSchema.parse(args);
          result = await tools.getGraphFiltered(graphState, validatedArgs);
        } else {
          // Backward compatible - use original getGraph
          validatedArgs = GetGraphArgsSchema.parse(args || {});
          result = await tools.getGraph(graphState, validatedArgs);
        }
        break;
      
      case MCP_FUNCTION_IDS.ADD_NODE:
        validatedArgs = AddNodeArgsSchema.parse(args);
        result = await tools.addNode(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.DELETE_NODE:
        validatedArgs = DeleteNodeArgsSchema.parse(args);
        result = await tools.deleteNode(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.ADD_EDGE:
        validatedArgs = AddEdgeArgsSchema.parse(args);
        result = await tools.addEdge(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.DELETE_EDGE:
        validatedArgs = DeleteEdgeArgsSchema.parse(args);
        result = await tools.deleteEdge(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.UPDATE_NODE:
        validatedArgs = UpdateNodeArgsSchema.parse(args);
        result = await tools.updateNode(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.UPDATE_EDGE:
        validatedArgs = UpdateEdgeArgsSchema.parse(args);
        result = await tools.updateEdge(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.DESCRIBE_LAYER:
        // Simple validation for layer parameter
        if (!args || !args.layer) {
          throw new Error('Layer parameter is required');
        }
        result = await tools.describeLayer(graphState, args);
        break;
      
      case MCP_FUNCTION_IDS.BATCH_NODES:
        validatedArgs = BatchNodesArgsSchema.parse(args);
        result = await tools.batchNodes(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.BATCH_EDGES:
        validatedArgs = BatchEdgesArgsSchema.parse(args);
        result = await tools.batchEdges(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.QUERY_NODES:
        validatedArgs = QueryNodesArgsSchema.parse(args || {});
        result = await tools.queryNodes(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.QUERY_EDGES:
        validatedArgs = QueryEdgesArgsSchema.parse(args || {});
        result = await tools.queryEdges(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.TRAVERSE_GRAPH:
        validatedArgs = TraverseGraphArgsSchema.parse(args);
        result = await tools.traverseGraph(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.CREATE_COMPOUND_NODE:
        validatedArgs = CreateCompoundNodeArgsSchema.parse(args);
        result = await tools.createCompoundNode(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.ADD_CHILD_NODES:
        validatedArgs = AddChildNodesArgsSchema.parse(args);
        result = await tools.addChildNodes(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.REMOVE_CHILD_NODES:
        validatedArgs = RemoveChildNodesArgsSchema.parse(args);
        result = await tools.removeChildNodes(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.MOVE_NODES:
        validatedArgs = MoveNodesArgsSchema.parse(args);
        result = await tools.moveNodes(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.GET_COMPOUND_HIERARCHY:
        validatedArgs = GetCompoundHierarchyArgsSchema.parse(args || {});
        result = await tools.getCompoundHierarchy(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.TOGGLE_COMPOUND_COLLAPSE:
        validatedArgs = ToggleCompoundCollapseArgsSchema.parse(args);
        result = await tools.toggleCompoundCollapse(graphState, validatedArgs);
        break;
      
      case MCP_FUNCTION_IDS.CONVERT_TO_COMPOUND:
        validatedArgs = ConvertToCompoundArgsSchema.parse(args);
        result = await tools.convertToCompound(graphState, validatedArgs);
        break;
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Return successful result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Enhanced error handling with structured responses
    // eslint-disable-next-line prefer-const
    let errorResponse: any = {
      success: false,
      timestamp: new Date().toISOString(),
      tool: name
    };

    if (error instanceof ZodError) {
      // Validation error - provide detailed feedback
      errorResponse.error = {
        type: 'ValidationError',
        message: 'Invalid arguments provided',
        details: formatValidationError(error),
        issues: error.issues
      };
    } else if (error instanceof Error) {
      // Known error type
      errorResponse.error = {
        type: error.constructor.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    } else {
      // Unknown error type
      errorResponse.error = {
        type: 'UnknownError',
        message: String(error)
      };
    }

    console.error(`[MCP Error] Tool: ${name}`, errorResponse.error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('Codebase Visualizer MCP Server started successfully');
  console.error(`Available tools: ${TOOLS.length}`);
  console.error(`Current layer: ${graphState.getCurrentLayer()}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


