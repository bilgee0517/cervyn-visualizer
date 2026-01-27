/**
 * Mock Cytoscape for testing
 * Provides a minimal implementation of Cytoscape API for unit tests
 */

export class MockCytoscapeNode {
  private _data: any;
  private _position: { x: number; y: number };
  private _style: Map<string, any>;
  
  constructor(data: any) {
    this._data = data;
    this._position = { x: 0, y: 0 };
    this._style = new Map();
  }
  
  id(): string {
    return this._data.id || '';
  }
  
  data(key?: string, value?: any): any {
    if (key === undefined) return this._data;
    if (value === undefined) return this._data[key];
    this._data[key] = value;
    return this;
  }

  removeData(key: string): this {
    delete this._data[key];
    return this;
  }
  
  position(pos?: { x: number; y: number }): any {
    if (pos === undefined) return this._position;
    this._position = pos;
    return this;
  }
  
  renderedPosition(): { x: number; y: number } {
    return { ...this._position };
  }
  
  style(property?: string, value?: any): any {
    if (property === undefined) return Object.fromEntries(this._style);
    if (value === undefined) return this._style.get(property);
    this._style.set(property, value);
    return this;
  }

  removeStyle(property: string): this {
    this._style.delete(property);
    return this;
  }
  
  boundingBox(): any {
    return {
      x1: this._position.x - 50,
      y1: this._position.y - 50,
      x2: this._position.x + 50,
      y2: this._position.y + 50,
      w: 100,
      h: 100,
    };
  }
  
  addClass(className: string): this {
    return this;
  }
  
  removeClass(className: string): this {
    return this;
  }
  
  hasClass(className: string): boolean {
    return false;
  }
  
  hidden(): boolean {
    return this.style('display') === 'none';
  }
  
  visible(): boolean {
    return !this.hidden();
  }
  
  isParent(): boolean {
    return this.data('isCompound') === true;
  }
  
  isChild(): boolean {
    return !!this.data('parent');
  }
  
  parent(): MockCytoscapeCollection {
    const parentId = this.data('parent');
    if (!parentId) return new MockCytoscapeCollection([]);
    // Would need cy reference to get parent
    return new MockCytoscapeCollection([]);
  }
  
  children(): MockCytoscapeCollection {
    return new MockCytoscapeCollection([]);
  }
  
  width(): number {
    return 100;
  }
  
  height(): number {
    return 80;
  }
  
  source(): MockCytoscapeNode {
    return this;
  }
  
  target(): MockCytoscapeNode {
    return this;
  }

  connectedEdges(): MockCytoscapeCollection {
    // Return empty collection for testing
    // In real Cytoscape, this would return edges connected to this node
    return new MockCytoscapeCollection([]);
  }
}

export class MockCytoscapeCollection {
  private _nodes: MockCytoscapeNode[];
  length: number;
  
  constructor(nodes: MockCytoscapeNode[] = []) {
    this._nodes = nodes;
    this.length = nodes.length;
  }
  
  forEach(callback: (node: MockCytoscapeNode, index: number) => void): void {
    this._nodes.forEach(callback);
  }
  
  map(callback: (node: MockCytoscapeNode, index: number) => any): any[] {
    return this._nodes.map(callback);
  }
  
  filter(selector: string | ((node: MockCytoscapeNode) => boolean)): MockCytoscapeCollection {
    if (typeof selector === 'function') {
      return new MockCytoscapeCollection(this._nodes.filter(selector));
    }
    // Simple selector parsing
    if (selector === ':visible') {
      return new MockCytoscapeCollection(this._nodes.filter(n => n.style('display') !== 'none'));
    }
    return new MockCytoscapeCollection(this._nodes);
  }
  
  nodes(selector?: string): MockCytoscapeCollection {
    return this;
  }
  
  edges(selector?: string): MockCytoscapeCollection {
    return new MockCytoscapeCollection([]);
  }
  
  layout(options: any): any {
    return {
      run: jest.fn(),
      stop: jest.fn(),
      on: jest.fn(),
      one: jest.fn((event: string, callback: () => void) => {
        // Immediately call layoutstop callback for tests
        if (event === 'layoutstop') {
          setTimeout(callback, 10);
        }
      }),
    };
  }
  
  slice(start: number, end?: number): MockCytoscapeNode[] {
    return this._nodes.slice(start, end);
  }
  
  data(key?: string): any {
    if (this._nodes.length === 0) return undefined;
    return this._nodes[0].data(key);
  }
  
  style(property?: string, value?: any): any {
    this._nodes.forEach(node => node.style(property, value));
    return this;
  }
  
  addClass(className: string): this {
    this._nodes.forEach(node => node.addClass(className));
    return this;
  }
  
  removeClass(className: string): this {
    this._nodes.forEach(node => node.removeClass(className));
    return this;
  }
  
  sort(compareFn: (a: any, b: any) => number): MockCytoscapeNode[] {
    return this._nodes.sort(compareFn);
  }
}

export class MockCytoscape {
  private _nodes: MockCytoscapeNode[];
  private _edges: MockCytoscapeNode[];
  private _zoom: number;
  private _pan: { x: number; y: number };
  private _listeners: Map<string, Array<(evt: any) => void>>;
  public nodes: jest.Mock;
  public edges: jest.Mock;
  public elements: jest.Mock;
  
  constructor() {
    this._nodes = [];
    this._edges = [];
    this._zoom = 1;
    this._pan = { x: 0, y: 0 };
    this._listeners = new Map();
    
    // Make nodes, edges, and elements jest mocks so they can be spied on
    this.nodes = jest.fn((selector?: string) => {
      return new MockCytoscapeCollection(this._nodes);
    });
    
    this.edges = jest.fn((selector?: string) => {
      return new MockCytoscapeCollection(this._edges);
    });
    
    this.elements = jest.fn(() => {
      return new MockCytoscapeCollection([...this._nodes, ...this._edges]);
    });
  }
  
  add(elements: any): MockCytoscapeCollection {
    if (Array.isArray(elements)) {
      elements.forEach(el => {
        const node = new MockCytoscapeNode(el.data);
        if (el.group === 'edges') {
          this._edges.push(node);
        } else {
          this._nodes.push(node);
        }
      });
    }
    return new MockCytoscapeCollection(this._nodes);
  }
  
  remove(elements: any): this {
    return this;
  }
  
  zoom(level?: number): number | this {
    if (level === undefined) return this._zoom;
    this._zoom = level;
    return this;
  }
  
  pan(position?: { x: number; y: number }): { x: number; y: number } | this {
    if (position === undefined) return this._pan;
    this._pan = position;
    return this;
  }
  
  fit(padding?: number): this {
    return this;
  }
  
  center(elements?: any): this {
    return this;
  }
  
  on(events: string, selector: string | ((evt: any) => void), handler?: (evt: any) => void): this {
    const actualHandler = typeof selector === 'function' ? selector : handler;
    if (!actualHandler) return this;
    
    const eventList = events.split(' ');
    eventList.forEach(event => {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event)!.push(actualHandler);
    });
    
    return this;
  }
  
  off(events?: string, selector?: string, handler?: (evt: any) => void): this {
    if (!events) {
      this._listeners.clear();
      return this;
    }
    
    const eventList = events.split(' ');
    eventList.forEach(event => {
      if (handler) {
        const handlers = this._listeners.get(event) || [];
        this._listeners.set(event, handlers.filter(h => h !== handler));
      } else {
        this._listeners.delete(event);
      }
    });
    
    return this;
  }
  
  trigger(event: string, extraParams?: any): this {
    const handlers = this._listeners.get(event) || [];
    handlers.forEach(handler => handler({ type: event, ...extraParams }));
    return this;
  }
  
  batch(callback: () => void): this {
    callback();
    return this;
  }
  
  layout(options: any): any {
    return {
      run: jest.fn(),
      stop: jest.fn(),
      on: jest.fn(),
    };
  }
  
  style(): any[] {
    return [];
  }
  
  width(): number {
    return 800;
  }
  
  height(): number {
    return 600;
  }

  container(): HTMLElement | null {
    // Return a mock HTML element
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: {},
      offsetWidth: 800,
      offsetHeight: 600
    };
    return mockElement as any;
  }

  extent(): any {
    // Return viewport boundaries in graph coordinates
    const zoom = this._zoom;
    const pan = this._pan;
    const width = 800;
    const height = 600;

    return {
      x1: -pan.x / zoom,
      y1: -pan.y / zoom,
      x2: (width - pan.x) / zoom,
      y2: (height - pan.y) / zoom,
      w: width / zoom,
      h: height / zoom
    };
  }

  $(selector: string): MockCytoscapeCollection {
    // Simple selector parsing for common cases
    if (selector.includes('[type=')) {
      const typeMatch = selector.match(/\[type="?([^"\]]+)"?\]/);
      if (typeMatch) {
        const type = typeMatch[1];
        const filtered = this._nodes.filter(n => n.data('type') === type);
        return new MockCytoscapeCollection(filtered);
      }
    }
    if (selector.includes('[isCompound]')) {
      const filtered = this._nodes.filter(n => n.data('isCompound'));
      return new MockCytoscapeCollection(filtered);
    }
    return new MockCytoscapeCollection(this._nodes);
  }
  
  getElementById(id: string): MockCytoscapeNode | null {
    return this._nodes.find(n => n.data('id') === id) || null;
  }
  
  collection(elements: any[]): MockCytoscapeCollection {
    return new MockCytoscapeCollection(elements);
  }
  
  destroy(): void {
    this._nodes = [];
    this._edges = [];
    this._listeners.clear();
  }
  
  // Mock expand-collapse extension
  expandCollapse(options?: any): any {
    return {
      collapse: jest.fn(),
      expand: jest.fn(),
      collapseAll: jest.fn(),
      expandAll: jest.fn(),
      isCollapsible: jest.fn(() => false),
      isExpandable: jest.fn(() => false),
    };
  }
}

// Factory function to create mock Cytoscape instance
export function createMockCytoscape(options?: any): MockCytoscape {
  return new MockCytoscape();
}

