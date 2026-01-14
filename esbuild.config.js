/**
 * esbuild configuration for bundling webview code
 * Bundles ES6 modules into a single file for browser execution
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Configuration for webview bundle
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'out/webview/main.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife', // Immediately Invoked Function Expression for browser
  sourcemap: false, // Set to true for debugging
  minify: false, // Set to true for production
  logLevel: 'info',
  external: [], // No externals - bundle everything
};

// Build function
async function build() {
  try {
    console.log('🔨 Building webview with esbuild...');
    
    // Ensure output directory exists
    const outDir = path.dirname(webviewConfig.outfile);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    // Build
    await esbuild.build(webviewConfig);
    
    console.log('✅ Webview bundle created successfully!');
    console.log(`   Output: ${webviewConfig.outfile}`);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Watch function for development
async function watch() {
  try {
    console.log('👀 Watching webview files for changes...');
    
    const ctx = await esbuild.context(webviewConfig);
    await ctx.watch();
    
    console.log('✅ Watch mode enabled');
  } catch (error) {
    console.error('❌ Watch setup failed:', error);
    process.exit(1);
  }
}

// Run build or watch based on command line argument
const command = process.argv[2];

if (command === 'watch') {
  watch();
} else {
  build();
}



