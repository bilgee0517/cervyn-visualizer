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
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case MCP_FUNCTION_IDS.GET_GRAPH:
        result = await tools.getGraph(graphState, args);
        break;
      case MCP_FUNCTION_IDS.UPDATE_NODE:
        result = await tools.updateNode(graphState, args);
        break;
      case MCP_FUNCTION_IDS.UPDATE_EDGE:
        result = await tools.updateEdge(graphState, args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
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


