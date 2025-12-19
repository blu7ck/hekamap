#!/usr/bin/env node
/**
 * Copies Cesium static assets into public/cesium so they are served at /cesium.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', 'node_modules', 'cesium', 'Build', 'Cesium');
const dest = path.resolve(__dirname, '..', 'public', 'cesium');

function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    console.warn(`[copy-cesium] Source not found: ${from}`);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(src, dest);
console.log('[copy-cesium] Copied Cesium assets to public/cesium');

