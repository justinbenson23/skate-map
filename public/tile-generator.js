const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// === CONFIG ===
const inputImage = path.join(__dirname, 'skate-map.jpg');
const outputDir = path.join(__dirname, 'public', 'tiles');
const tileSize = 256;

async function generateTiles() {
  const img = sharp(inputImage);
  const meta = await img.metadata();
  const { width, height } = meta;

  console.log(`Image size: ${width}x${height}`);

  // Determine max zoom such that tiles at that level match original resolution
  const maxZoom = Math.ceil(Math.log2(Math.max(width, height) / tileSize));
  console.log(`Calculated maxZoom = ${maxZoom}`);

  for (let z = 0; z <= maxZoom; z++) {
    const scale = Math.pow(2, maxZoom - z);
    const scaledWidth = Math.ceil(width / scale);
    const scaledHeight = Math.ceil(height / scale);

    const cols = Math.ceil(scaledWidth / tileSize);
    const rows = Math.ceil(scaledHeight / tileSize);

    const zoomDir = path.join(outputDir, `${z}`);
    fs.mkdirSync(zoomDir, { recursive: true });

    console.log(`Zoom ${z} → ${cols}x${rows} tiles`);

    // Resize image to current zoom size
    const resized = await img
      .clone()
      .resize({ width: scaledWidth, height: scaledHeight, fit: 'contain' })
      .toBuffer();

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const left = x * tileSize;
        const top = y * tileSize;

        const extractWidth = Math.min(tileSize, scaledWidth - left);
        const extractHeight = Math.min(tileSize, scaledHeight - top);

        const tile = await sharp(resized)
          .extract({
            left,
            top,
            width: extractWidth,
            height: extractHeight,
          })
          .resize(tileSize, tileSize) // pad small tiles to full size
          .jpeg({ quality: 90 })
          .toBuffer();

        const tileName = `${x}_${y}.jpg`;
        const tilePath = path.join(zoomDir, tileName);
        await sharp(tile).toFile(tilePath);
      }
    }
  }

  console.log('✅ Tile generation complete!');
}

generateTiles().catch(err => {
  console.error('Tile generation failed:', err);
});
