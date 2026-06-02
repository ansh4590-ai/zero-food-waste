import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const inputPath = './public/images/volunteer_icon.png';
const outputPath = './public/images/volunteer_icon.png';

// Read image as raw RGBA pixels
const image = sharp(inputPath);
const { data, info } = await image
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

// Sample background color from top-left corner
const bgR = data[0];
const bgG = data[1];
const bgB = data[2];

console.log(`Image: ${width}x${height}, BG color sampled: rgb(${bgR},${bgG},${bgB})`);

// Make pixels that are close to the background color transparent
const threshold = 40;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const dist = Math.sqrt(
    Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
  );
  if (dist < threshold) {
    data[i + 3] = 0; // set alpha to 0 (transparent)
  }
}

// Write back as PNG with transparency
await sharp(Buffer.from(data), {
  raw: { width, height, channels }
}).png().toFile(outputPath);

console.log('Done! Background removed and saved to', outputPath);
