# Cervyn Visualizer MCP Server

**Model Context Protocol (MCP) server for AI-powered knowledge graph manipulation.**

This MCP server exposes tools that allow AI agents (Claude, GPT, etc.) to programmatically manipulate the codebase knowledge graph in **Cervyn Visualizer**.

---

## 🚀 Features

### **Available Tools** (20 tools)

#### **Graph Operations** (Basic)
- `getGraph` - Retrieve current graph data with layer metadata and guidance (now supports filtering & pagination!)
- `addNode` - Add new nodes with validation warnings and layer guidance
- `deleteNode` - Remove nodes from a specific layer
- `addEdge` - Create edges between nodes (supports cross-layer edges)
- `deleteEdge` - Remove edges from a specific layer
- `updateNode` - Modify node properties (label, roleDescription, technology, progressStatus, feature annotations)
- `updateEdge` - Modify edge properties (label, edgeType, description)

#### **Batch Operations** (NEW - 50x Faster)
- `batchNodes` - Process multiple node operations (add/update/delete) in a single transaction
- `batchEdges` - Process multiple edge operations (add/update/delete) in a single transaction

#### **Query & Filtering** (NEW - Smart Search)
- `queryNodes` - Advanced node search with filtering, pagination, and pattern matching
- `queryEdges` - Filter edges by type, source/target, and patterns

#### **Graph Traversal** (NEW - Path Finding)
- `traverseGraph` - Navigate the graph (neighbors, paths, subgraphs, BFS, DFS)

#### **Compound Nodes** (NEW - Hierarchical Structures)
- `createCompoundNode` - Create a parent node that can contain other nodes
- `addChildNodes` - Add children to a compound node
- `removeChildNodes` - Remove children from a compound node
- `moveNodes` - Move nodes between parents or to root level
- `getCompoundHierarchy` - Get parent-child tree structure
- `toggleCompoundCollapse` - Expand/collapse compound nodes
- `convertToCompound` - Convert regular node to compound node

#### **Layer Management**
- `describeLayer` - Get detailed layer guidance, recommended types, and usage examples

### **5-Layer System with Type Enforcement**
- **Workflow** - Feature mapping and dependency tracking (🔒 **STRICT** validation)
- **Context** - Actors and external boundaries (🔒 **STRICT** validation)
- **Container** - Runtime + data ownership (🔒 **STRICT** validation)
- **Component** - Modules and packages (⚠️  Flexible with warnings)
- **Code** - Implementation details (🔒 **STRICT** validation, auto-populated)

### **Context Layer: Simplified & Boundary-Focused**

The context layer has been **simplified and tightened** to focus on boundary interactions:

**Node Types (5 types, down from 7):**
- `actor` — People, users, roles, personas (replaces `person`, `user-role`)
- `external-system` — Generic external systems
- `external-api` — External REST/GraphQL APIs
- `external-datastore` — External databases, caches, data warehouses (replaces `database`)
- `external-service` — SaaS services like Auth0, Stripe, Twilio (replaces `third-party-service`, `external-dependency`)

**Edge Types (7 boundary-focused types):**
- `uses` — Actor uses system (human interaction)
- `integrates-with` — Bidirectional system integration
- `authenticates-with` — Authentication relationships
- `reads-from` — Data reading from external source
- `writes-to` — Data writing to external target
- `sends-event-to` — Event publishing to external system (NEW)
- `receives-event-from` — Event subscription from external system (NEW)

**Example Usage:**
```json
{
  "name": "addNode",
  "arguments": {
    "label": "Admin User",
    "type": "actor",
    "layer": "context"
  }
}

{
  "name": "addEdge",
  "arguments": {
    "sourceId": "actor-admin",
    "targetId": "system-web-app",
    "edgeType": "uses",
    "label": "Admin Portal",
    "description": "Admin users access the web application through the admin portal. Uses session-based authentication with role-based access control.",
    "layer": "context"
  }
}

{
  "name": "addNode",
  "arguments": {
    "label": "Stripe API",
    "type": "external-service",
    "layer": "context",
    "roleDescription": "Third-party payment processing service. Handles credit card transactions, subscriptions, recurring billing, and webhook notifications for payment events.",
    "technology": "REST API"
  }
}
```

**Strict Validation Enabled:**
- Only the 5 recommended node types are allowed
- Generic `depends-on` edge is discouraged (too vague for boundaries)
- Use specific edge types to clarify the nature of each boundary interaction

### **Container Layer: Runtime + Data Ownership**

The container layer uses **runtime-specific semantics** to show what actually happens at runtime:

**Node Types (8 types):**
- `frontend` — Client apps (web, mobile, desktop)
- `service` — Backend services, APIs, microservices
- `worker` — Background job processors, async task handlers
- `gateway` — API gateways, load balancers, edge routers
- `message-broker` — Event buses (Kafka, RabbitMQ, NATS)
- `datastore` — Databases you own (PostgreSQL, MySQL, MongoDB)
- `cache` — In-memory caches (Redis, Memcached)
- `object-store` — Blob storage you own (S3, MinIO, Azure Blob)

**Edge Types (10 runtime-specific types):**

**Synchronous (blocking):**
- `http-request` — REST/HTTP call (sync request-response)
- `rpc-call` — gRPC/RPC call (sync)
- `db-query` — Database query (sync read/write)
- `cache-read` — Cache lookup (sync)
- `cache-write` — Cache update (sync)

**Asynchronous (non-blocking):**
- `publish-event` — Publish to message broker (fire and forget)
- `consume-event` — Subscribe/consume from broker (event-driven)
- `enqueue-job` — Add job to worker queue (async processing)

**Data flow:**
- `replicates-to` — Data replication (primary → replica)
- `syncs-with` — Bidirectional data synchronization

**Example Usage:**
```json
{
  "name": "addNode",
  "arguments": {
    "label": "Web Frontend",
    "type": "frontend",
    "layer": "container",
    "roleDescription": "React-based single-page application. Provides user interface for browsing products, managing cart, and checkout. Communicates with backend via REST API.",
    "technology": "React 18 + TypeScript"
  }
}

{
  "name": "addEdge",
  "arguments": {
    "sourceId": "frontend-web",
    "targetId": "gateway-api",
    "edgeType": "http-request",
    "label": "REST API",
    "description": "Frontend makes REST API calls to the gateway for all backend operations. Includes authentication token in Authorization header. Returns JSON responses.",
    "layer": "container"
  }
}

{
  "name": "addNode",
  "arguments": {
    "label": "PostgreSQL Primary",
    "type": "datastore",
    "layer": "container",
    "roleDescription": "Primary PostgreSQL database storing all application data including users, orders, products, and sessions. Configured with streaming replication to read replicas.",
    "technology": "PostgreSQL 15"
  }
}

{
  "name": "addEdge",
  "arguments": {
    "sourceId": "service-order",
    "targetId": "broker-kafka",
    "edgeType": "publish-event",
    "label": "order.created",
    "description": "Order service publishes 'order.created' event to Kafka when a new order is placed. Event includes order ID, customer info, items, and total. Consumed by inventory, notification, and analytics services.",
    "layer": "container"
  }
}
```

**Strict Validation Enabled:**
- Only runtime-specific edge types allowed (no generic `calls` or `depends-on`)
- Edge types show **what happens at runtime** (sync vs async, blocking vs non-blocking)
- Clear data ownership: `datastore`, `cache`, `object-store` show where state lives
- Developers instantly see which operations block and which don't

**Key Benefits:**
- **Sync vs Async clarity:** Solid lines = blocking, dashed = non-blocking
- **Data ownership:** Know which services own which databases/caches
- **Runtime semantics:** `http-request` vs `rpc-call` vs `db-query` (not just "calls")
- **Better architecture:** Forces thinking about runtime behavior

### **Feature Annotation System**
Cross-layer tracing with `supportsFeatures` and `supportedBy` arrays enables tracking which code implements which features.

### **Type Enforcement & Styling**
- **Strict validation** for Workflow, Context, Container, and Code layers ensures correct visual styling
- **Flexible validation** for Component layer with helpful warnings
- **Node type mapping** documents which types map to which visual styles
- **Layer guidance** includes what to include/avoid for each layer

### **Rich Descriptions for Better Tooltips**

**ALWAYS include detailed descriptions** when adding nodes and edges. Descriptions appear in interactive tooltips and help developers understand the architecture at a glance.

**Node Descriptions (roleDescription):**
- 1-2 sentences explaining what the node does, its purpose, and key responsibilities
- Include technology stack in the `technology` field
- Examples:
  - Workflow: `"Allows users to authenticate using email/password. Handles login, session creation, and token generation."`
  - Context: `"Third-party payment processing service. Handles credit card transactions, subscriptions, and webhooks."`
  - Container: `"Backend REST API service that handles user authentication, authorization, and session management. Built with Express.js."`
  - Component: `"Shared validation library used across services. Provides schema validation, input sanitization, and error formatting."`

**Edge Descriptions:**
- Be specific about what flows through this edge (data, events, calls, etc.)
- Mention key details like protocols, data formats, or frequency
- Examples:
  - `http-request`: `"REST API call to fetch user profile. Returns JSON with user data, roles, and preferences."`
  - `publish-event`: `"Publishes 'order.created' event with order ID, customer info, and items. Consumed by inventory and notification services."`
  - `db-query`: `"Queries users table by email. Returns user record with hashed password for authentication."`
  - `reads-from`: `"Pulls customer subscription data via Stripe API. Synced every 5 minutes."`

**Benefits:**
- Tooltips show descriptions when hovering/clicking on nodes and edges
- Developers can understand architecture without reading code
- Onboarding is faster with clear, contextual explanations
- Documentation is embedded directly in the visual graph

---

## 📦 Installation

```bash
cd mcp-server
npm install
npm run build
```

---

## 🔧 Configuration

Add the MCP server to your Cursor/Claude Desktop configuration file (`~/.cursor/mcp.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codebase-visualizer": {
      "command": "node",
      "args": [
        "${HOME}/path/to/cervyn-visualizer/mcp-server/dist/index.js"
      ]
    }
  }
}
```

**Note:** Replace `${HOME}/path/to/cervyn-visualizer` with the actual path where you cloned this repository.

---

## 🧪 Usage

### **In Cursor/Claude Desktop**

After building and configuring, restart Cursor. Then in a chat with Claude:

```
"Get the current graph for the code layer"
```

or

```
"Describe the workflow layer and show me what it's used for"
```

Claude will use the MCP tools automatically.

## 🎯 Performance Improvements

The MCP server now includes significant performance enhancements:

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Find node by ID | O(n) ~10ms | O(1) ~0.1ms | **100x faster** |
| Filter nodes by type | O(n) full scan | O(k) index lookup | **20x faster** |
| Add 50 nodes | 50 calls, 50 writes | 1 call, 1 write | **50x fewer I/O** |
| Find neighbors (depth 2) | O(n*m) ~500ms | O(V+E) ~5ms | **100x faster** |
| Load graph for 1 node | 5MB JSON | 5KB JSON | **1000x less data** |

### **Key Features**

1. **In-Memory Indexing**: O(1) lookups for nodes by ID, type, feature
2. **Batch Processing**: Single file write for multiple operations
3. **Smart Filtering**: Load only what you need (50 nodes instead of 1000+)
4. **Graph Traversal**: Efficient path finding and neighbor queries using adjacency lists
5. **Pagination**: Handle large result sets without overwhelming AI context

---

## 📖 Example Tool Calls

### **Basic Operations**

#### 1. **Get Graph with Layer Info**
```json
{
  "name": "getGraph",
  "arguments": {
    "layer": "code"
  }
}
```

Response:
```json
{
  "success": true,
  "layer": "code",
  "layerInfo": {
    "name": "Code Layer",
    "purpose": "Detailed implementation",
    "recommendedNodeTypes": ["file", "class", "function", ...],
    "examples": [...]
  },
  "nodeCount": 42,
  "edgeCount": 67,
  "nodes": [...],
  "edges": [...]
}
```

#### 2. **Add Node with Detailed Description**
```json
{
  "name": "addNode",
  "arguments": {
    "label": "User Login",
    "type": "feature",
    "layer": "workflow",
    "roleDescription": "Allows users to authenticate using email/password. Handles login, session creation, and token generation. Supports password reset and 2FA.",
    "supportedBy": ["service-auth", "file-LoginController"]
  }
}
```

Response includes warnings if type doesn't match layer:
```json
{
  "success": true,
  "nodeId": "node-user-login-123",
  "layer": "workflow",
  "warnings": ["...guidance messages..."],
  "recommendations": {
    "suggestedNodeTypes": [...]
  }
}
```

#### 3. **Update Node**
```json
{
  "name": "updateNode",
  "arguments": {
    "nodeId": "file-src/AuthService.ts",
    "roleDescription": "Handles user authentication and authorization",
    "technology": "Express.js",
    "progressStatus": "in-progress",
    "supportsFeatures": ["feature-user-login", "feature-password-reset"]
  }
}
```

#### 4. **Describe Layer** (Enhanced with Type Guidance)
```json
{
  "name": "describeLayer",
  "arguments": {
    "layer": "workflow"
  }
}
```

**Response** (now includes what to add/avoid + type mapping):
```json
{
  "success": true,
  "layer": "workflow",
  "guidance": {
    "name": "Workflow Layer",
    "purpose": "Feature mapping and dependency tracking",
    "recommendedNodeTypes": ["feature", "feature-group"],
    "recommendedEdgeTypes": ["enables", "requires", "composed-of"],
    "examples": ["User Authentication feature", "Payment Flow feature-group"],
    "useCases": ["Map features and dependencies", "Trace feature to code"],
    "warnings": ["Use supportedBy array to link to implementation"],
    "whatToInclude": [
      "User-facing capabilities (Login, Search, Checkout)",
      "Feature groups for related capabilities",
      "High-level workflows and user journeys",
      "Link features to implementation via supportedBy array"
    ],
    "whatToAvoid": [
      "Technical implementation details",
      "Specific files, classes, or functions",
      "External systems (use context layer)",
      "Services and APIs (use container layer)"
    ],
    "nodeTypeMapping": {
      "feature": "hexagon (bold border, medium size)",
      "feature-group": "round-rectangle with dashed border"
    },
    "strictValidation": true,
    "validationMessage": "🔒 This layer enforces STRICT type validation"
  }
}
```

#### 5. **Update Edge**
```json
{
  "name": "updateEdge",
  "arguments": {
    "edgeId": "edge-auth-api",
    "label": "authenticates",
    "edgeType": "uses",
    "description": "API uses AuthService for authentication"
  }
}
```

---

### **Batch Operations** (NEW)

#### 6. **Batch Add Multiple Nodes**
```json
{
  "name": "batchNodes",
  "arguments": {
    "layer": "code",
    "operations": [
      {
        "action": "add",
        "node": {
          "label": "AuthService",
          "type": "file",
          "technology": "TypeScript",
          "supportsFeatures": ["feature-login"]
        }
      },
      {
        "action": "add",
        "node": {
          "label": "UserController",
          "type": "file",
          "technology": "TypeScript"
        }
      },
      {
        "action": "update",
        "nodeId": "file-DatabaseClient",
        "updates": {
          "technology": "PostgreSQL",
          "progressStatus": "done"
        }
      }
    ],
    "atomic": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "totalOperations": 3,
  "successCount": 3,
  "failureCount": 0,
  "results": [
    { "index": 0, "action": "add", "success": true, "id": "node-authservice-123" },
    { "index": 1, "action": "add", "success": true, "id": "node-usercontroller-124" },
    { "index": 2, "action": "update", "success": true, "id": "file-DatabaseClient" }
  ],
  "layer": "code",
  "executionTimeMs": 15
}
```

Benefits: 3 operations in 1 call, 1 file write instead of 3

---

### **Query & Filtering** (NEW)

#### 7. **Query Nodes with Filters**
```json
{
  "name": "queryNodes",
  "arguments": {
    "layer": "code",
    "filter": {
      "nodeTypes": ["file", "class"],
      "labelPattern": "Auth.*",
      "supportsFeatures": ["feature-login"],
      "limit": 50,
      "offset": 0
    },
    "includeEdges": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "layer": "code",
  "totalMatches": 127,
  "returnedCount": 50,
  "hasMore": true,
  "nodes": [...],
  "edges": [...],
  "executionTimeMs": 5
}
```

#### 8. **Get Graph Summary (Statistics Only)**
```json
{
  "name": "getGraph",
  "arguments": {
    "layer": "code",
    "summaryOnly": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "layer": "code",
  "summaryOnly": true,
  "statistics": {
    "nodeCount": 1247,
    "edgeCount": 3421,
    "nodeTypeCount": 5,
    "edgeTypeCount": 4,
    "nodesByType": {
      "file": 842,
      "class": 305,
      "function": 100
    },
    "edgesByType": {
      "imports": 2100,
      "calls": 1200,
      "extends": 121
    }
  },
  "executionTimeMs": 2
}
```

Benefits: Get overview without transferring 5MB of data

#### 9. **Get Graph with Pagination**
```json
{
  "name": "getGraph",
  "arguments": {
    "layer": "code",
    "filter": {
      "nodeTypes": ["file"],
      "limit": 100,
      "offset": 0
    }
  }
}
```

Returns first 100 file nodes instead of all 1247 nodes.

---

### **Graph Traversal** (NEW)

#### 10. **Find Neighbors**
```json
{
  "name": "traverseGraph",
  "arguments": {
    "operation": "neighbors",
    "startNodeId": "file-AuthService",
    "layer": "code",
    "direction": "outgoing",
    "depth": 2,
    "filter": {
      "edgeTypes": ["imports", "calls"]
    }
  }
}
```

**Use case:** "What files does AuthService import, and what do they import?"

**Response:**
```json
{
  "success": true,
  "operation": "neighbors",
  "startNodeId": "file-AuthService",
  "layer": "code",
  "nodes": [
    { "data": { "id": "file-AuthService", "label": "AuthService.ts" } },
    { "data": { "id": "file-jwt-utils", "label": "jwt-utils.ts" } },
    { "data": { "id": "file-DatabaseClient", "label": "DatabaseClient.ts" } }
  ],
  "edges": [...],
  "metadata": {
    "nodeCount": 3,
    "edgeCount": 2,
    "depth": 2
  },
  "executionTimeMs": 3
}
```

#### 11. **Find Shortest Path**
```json
{
  "name": "traverseGraph",
  "arguments": {
    "operation": "path",
    "startNodeId": "file-UserController",
    "endNodeId": "file-DatabaseClient",
    "layer": "code",
    "filter": {
      "edgeTypes": ["imports", "calls"]
    }
  }
}
```

**Use case:** "How does UserController reach DatabaseClient?"

**Response:**
```json
{
  "success": true,
  "operation": "path",
  "nodes": [
    { "data": { "id": "file-UserController", "label": "UserController.ts" } },
    { "data": { "id": "file-AuthService", "label": "AuthService.ts" } },
    { "data": { "id": "file-DatabaseClient", "label": "DatabaseClient.ts" } }
  ],
  "edges": [...],
  "metadata": {
    "pathLength": 2,
    "nodeCount": 3,
    "edgeCount": 2
  },
  "executionTimeMs": 8
}
```

#### 12. **Extract Subgraph**
```json
{
  "name": "traverseGraph",
  "arguments": {
    "operation": "subgraph",
    "startNodeId": "feature-login",
    "layer": "workflow",
    "depth": 2
  }
}
```

**Use case:** "Show me all nodes related to the login feature"

Returns all nodes within 2 hops of the login feature node.

---

### **Compound Nodes** (NEW)

#### 13. **Create Compound Node**
```json
{
  "name": "createCompoundNode",
  "arguments": {
    "label": "Authentication Module",
    "type": "module",
    "groupType": "logical",
    "layer": "component",
    "roleDescription": "Handles all authentication logic",
    "technology": "Node.js"
  }
}
```

**Use case:** "Create a logical grouping for auth-related components"

**Response:**
```json
{
  "success": true,
  "message": "Compound node 'Authentication Module' created successfully",
  "nodeId": "node-authentication-module-123",
  "layer": "component",
  "isCompound": true,
  "groupType": "logical",
  "childCount": 0
}
```

#### 14. **Add Child Nodes**
```json
{
  "name": "addChildNodes",
  "arguments": {
    "parentId": "node-authentication-module-123",
    "childIds": [
      "file-AuthService",
      "file-UserController",
      "file-TokenManager"
    ],
    "layer": "component"
  }
}
```

**Use case:** "Group related files under the auth module"

**Automatically:**
- Updates parent's `children` list
- Sets `parent` reference on child nodes
- Removes children from old parents if they had one

#### 15. **Get Compound Hierarchy**
```json
{
  "name": "getCompoundHierarchy",
  "arguments": {
    "rootNodeId": "node-authentication-module-123",
    "layer": "component",
    "maxDepth": 5
  }
}
```

**Use case:** "Show me the full structure of the auth module"

**Response:**
```json
{
  "success": true,
  "layer": "component",
  "hierarchy": {
    "nodeId": "node-authentication-module-123",
    "label": "Authentication Module",
    "type": "module",
    "isCompound": true,
    "groupType": "logical",
    "childCount": 3,
    "children": ["file-AuthService", "file-UserController", "file-TokenManager"],
    "isCollapsed": false,
    "depth": 0
  }
}
```

#### 16. **Move Nodes**
```json
{
  "name": "moveNodes",
  "arguments": {
    "nodeIds": ["file-helper-1", "file-helper-2"],
    "targetParentId": "folder-utils",
    "layer": "code"
  }
}
```

**Use cases:**
- Move files to different folders
- Reorganize hierarchy
- Promote to root level: `"targetParentId": null`

#### 17. **Convert to Compound**
```json
{
  "name": "convertToCompound",
  "arguments": {
    "nodeId": "service-api",
    "groupType": "logical",
    "layer": "container"
  }
}
```

**Use case:** "I want to add children to this existing node"

---

## 🎨 Type Enforcement & Visual Styling

### **How It Works**

The MCP server now enforces node types to ensure correct visual styling in the graph:

1. **Strict Layers** (Workflow, Code):
   - Only allow specific node types
   - Block invalid types with clear error messages
   - Guarantee correct styling in visualization

2. **Flexible Layers** (Context, Container, Component):
   - Allow recommended types + others
   - Show warnings for non-recommended types
   - Suggest better alternatives

### **Example: Adding a Node with Wrong Type**

```typescript
// ❌ This will FAIL (strict validation)
addNode({
  label: "User Service",
  type: "service",      // Wrong type for workflow layer!
  layer: "workflow"
})

// Error Response:
{
  "error": "❌ Node type 'service' is not allowed in 'workflow' layer.\n\n" +
           "✅ Allowed types: feature, feature-group\n\n" +
           "💡 This layer enforces strict type validation.\n" +
           "   Suggested layer for 'service': container"
}

// ✅ This will SUCCEED
addNode({
  label: "User Authentication",
  type: "feature",      // Correct type!
  layer: "workflow"
})
```

### **Node Type → Visual Style Mapping**

Each layer's `describeLayer` includes `nodeTypeMapping` showing which types map to which visual styles:

| Layer | Node Type | Visual Style |
|-------|-----------|--------------|
| Workflow | `feature` | Hexagon (bold border, medium) |
| Workflow | `feature-group` | Round-rectangle (dashed, compound) |
| Context | `actor` | Ellipse (teal, human/role) |
| Context | `external-system` | Round-rectangle (rose) |
| Context | `external-api` | Round-rectangle (pink accent) |
| Context | `external-datastore` | Round-rectangle (yellow, data storage) |
| Context | `external-service` | Round-rectangle (rose light, SaaS) |
| Container | `service` | Round-rectangle (service indicator) |
| Container | `web-app` | Round-rectangle (browser icon) |
| Component | `module` | Round-rectangle (module icon) |
| Component | `package` | Round-rectangle (package icon) |
| Code | `file` | Round-rectangle (small, file) |
| Code | `directory` | Round-rectangle (dashed, compound) |
| Code | `class` | Round-rectangle (purple accent) |

---

## 🏗️ Architecture

```
mcp-server/
├── src/
│   ├── index.ts                      # Main MCP server (13 tools registered)
│   ├── graph-state-manager.ts        # In-memory graph state (5-layer system) + indexes
│   ├── mcp-function-ids.ts           # Function ID constants
│   ├── config/
│   │   └── layer-guidance.ts         # Layer metadata and recommendations
│   ├── types/
│   │   └── layer-types.ts            # TypeScript type definitions
│   ├── indexing/                     # NEW: Indexing system
│   │   └── graph-indexes.ts          # O(1) lookups, adjacency lists
│   ├── validation/
│   │   ├── schemas.ts                # Zod validation schemas (original tools)
│   │   └── query-schemas.ts          # NEW: Validation for batch/query/traversal
│   └── tools/
│       ├── index.ts                  # Tool exports
│       ├── graph-operations.ts       # Add/remove/update nodes/edges (basic)
│       ├── batch-operations.ts       # NEW: Batch processing
│       ├── query-operations.ts       # NEW: Filtering, search, pagination
│       ├── traversal-operations.ts   # NEW: Graph traversal algorithms
│       ├── proposed-changes.ts       # Propose/apply changes
│       └── layer-management.ts       # Layer info & describeLayer
├── package.json
├── tsconfig.json
└── README.md
```

### **Performance Architecture**

```
┌─────────────────────────────────────┐
│        MCP Server Tools             │
│  (getGraph, queryNodes, traverse)   │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│     GraphStateManager               │
│  - In-memory graphs (5 layers)      │
│  - Debounced file writes            │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│       LayerIndexes (NEW)            │
│  - ID Index: O(1) node lookup       │
│  - Type Index: O(1) type filtering  │
│  - Feature Index: O(1) feature find │
│  - Adjacency Lists: O(V+E) traversal│
└─────────────────────────────────────┘
```

---

## 🔄 Development Workflow

### **Build**
```bash
npm run build
```

### **Watch Mode**
```bash
npm run watch
```

### **Test Locally**
```bash
npm run start
```

Then send JSON-RPC messages via stdin.

---

## 🎯 AI Agent Workflow

### **Typical Claude Conversation**

**User:** "Show me the current codebase graph"

**Claude:** "I'll retrieve the current graph data for you..."

Claude calls:
```
getGraph({ layer: "code" })
```

**User:** "Create a feature node for user login in the workflow layer"

**Claude:** "I'll add a workflow node for the user login feature..."

Claude calls:
```
addNode({
  label: "User Login",
  type: "feature",
  layer: "workflow",
  roleDescription: "Authenticates users with email/password",
  supportedBy: ["service-auth"]
})
```

**User:** "Update the AuthService node to mark it as supporting the login feature"

**Claude:** "I'll update that node to link it to the feature..."

Claude calls:
```
updateNode({
  nodeId: "file-src/AuthService.ts",
  progressStatus: "in-progress",
  supportsFeatures: ["feature-user-login"]
})
```

---

## 🐛 Troubleshooting

### **MCP Server Not Found**
- Check that `mcp.json` path is correct
- Ensure `npm run build` completed successfully
- Verify `dist/index.js` exists

### **Tool Calls Failing**
- Check stderr logs (server logs to stderr, not stdout)
- Verify node IDs exist before operations
- Ensure layer names are valid

### **Graph State Lost**
- State is shared via file system (~/.codebase-visualizer/state.json)
- VS Code extension and MCP server sync state automatically
- If state seems stale, restart both the extension and MCP server

---

## 📊 Response Format

All tools return a consistent format:

```json
{
  "success": true,
  "message": "Operation completed",
  ...additional fields...
}
```

Or on error:
```json
{
  "error": "Error message here"
}
```

---

## 🔗 Integration with VS Code Extension

**Current Implementation:**
- State synchronization via shared file system (`~/.codebase-visualizer/state.json`)
- Changes made via MCP server automatically appear in VS Code extension
- Changes made in VS Code extension are available to MCP server
- File-based synchronization with version tracking

**Future Enhancements:**
- Real-time bidirectional sync (via IPC/WebSocket)
- Enhanced conflict resolution
- Network-based synchronization for remote collaboration

---

## 📝 License

MIT


