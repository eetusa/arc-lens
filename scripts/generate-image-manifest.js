/**
 * Generates a manifest of existing item images
 * Run: node scripts/generate-image-manifest.js
 * Output: public/image-manifest.json
 */

import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(__dirname, '../public/images');
const outputPath = join(__dirname, '../public/image-manifest.json');

// Get all .webp files and extract IDs (filename without extension)
const files = readdirSync(imagesDir);
const imageIds = files
  .filter(f => f.endsWith('.webp'))
  .map(f => f.replace('.webp', ''));

const manifest = {
  generated: new Date().toISOString(),
  count: imageIds.length,
  images: imageIds
};

writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log(`Generated image manifest: ${imageIds.length} images`);
