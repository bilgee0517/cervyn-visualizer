/**
 * Jest configuration for Cervyn Visualizer
 * 
 * Supports testing both:
 * - Webview code (browser environment)
 * - Extension code (Node.js environment)
 */

module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'jsdom', // Browser-like environment for webview tests
  
  // Test match patterns
  testMatch: [
    '**/src/**/__tests__/**/*.test.ts',
    '**/src/**/*.test.ts',
  ],
  
  // Module path aliases (matching tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/node_modules/**',
  ],
  
  coverageDirectory: 'coverage',
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Transform files
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/out/',
    '/dist/',
  ],
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Reset mocks between tests
  resetMocks: true,
};

