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
    description: 'Get the current graph data (nodes and edges)',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
          description: 'Which layer to retrieve (default: current layer)',
        },
      },
    },
  },
  {
    name: MCP_FUNCTION_IDS.ADD_NODE,
    description: 'Add a new node to a specific graph layer. Use this to create architectural concepts, dependency nodes, or other AI-generated nodes.',
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
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
          description: 'Layer to add the node to (default: current layer)',
        },
        roleDescription: {
          type: 'string',
          description: 'Description of the node\'s role (optional)',
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
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
          description: 'Layer to delete from (default: current layer)',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.ADD_EDGE,
    description: 'Add an edge between nodes. Nodes can be in different layers (cross-layer edges).',
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
          enum: ['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses'],
          description: 'Edge type (optional)',
        },
        label: {
          type: 'string',
          description: 'Edge label (optional)',
        },
        layer: {
          type: 'string',
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
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
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
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
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
          description: 'Which layer (default: current layer)',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: MCP_FUNCTION_IDS.UPDATE_EDGE,
    description: 'Update properties of an existing edge',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: 'Edge ID to update',
        },
        label: {
          type: 'string',
          description: 'New edge label (optional)',
        },
        edgeType: {
          type: 'string',
          enum: ['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses'],
          description: 'New edge type (optional)',
        },
        description: {
          type: 'string',
          description: 'Description of what this edge/relationship represents (optional)',
        },
        layer: {
          type: 'string',
          enum: ['blueprint', 'architecture', 'implementation', 'dependencies'],
          description: 'Which layer (default: current layer)',
        },
      },
      required: ['edgeId'],
    },
  },
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let validatedArgs: any;
    let result: any;

    // Validate arguments based on tool type
    switch (name) {
      case MCP_FUNCTION_IDS.GET_GRAPH:
        validatedArgs = GetGraphArgsSchema.parse(args || {});
        result = await tools.getGraph(graphState, validatedArgs);
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


