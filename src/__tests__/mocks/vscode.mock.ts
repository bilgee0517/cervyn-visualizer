/**
 * Mock VS Code API for testing
 */

export const mockVscode = {
  postMessage: jest.fn(),
  setState: jest.fn(),
  getState: jest.fn(() => null),
};

export function createMockVscode() {
  return {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => null),
  };
}

export function resetMockVscode() {
  mockVscode.postMessage.mockClear();
  mockVscode.setState.mockClear();
  mockVscode.getState.mockClear();
}


