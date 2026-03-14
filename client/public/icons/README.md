# PWA Icons

## Generate PNG icons from SVG

Use the following commands to generate all required sizes from `icon.svg`:

### Using ImageMagick (if available)
```bash
# Install ImageMagick if needed
# sudo apt-get install imagemagick

# Generate all sizes
convert icon.svg -resize 72x72 icon-72x72.png
convert icon.svg -resize 96x96 icon-96x96.png
convert icon.svg -resize 128x128 icon-128x128.png
convert icon.svg -resize 144x144 icon-144x144.png
convert icon.svg -resize 152x152 icon-152x152.png
convert icon.svg -resize 192x192 icon-192x192.png
convert icon.svg -resize 384x384 icon-384x384.png
convert icon.svg -resize 512x512 icon-512x512.png

# Apple Touch Icon
convert icon.svg -resize 180x180 apple-touch-icon.png

# Favicons
convert icon.svg -resize 32x32 favicon-32x32.png
convert icon.svg -resize 16x16 favicon-16x16.png
```

### Using Online Tools
Alternatively, upload `icon.svg` to:
- https://realfavicongenerator.net/
- https://www.favicon-generator.org/
- https://favicon.io/

### Using Node.js (sharp library)
```bash
npm install sharp-cli -g

sharp -i icon.svg -o icon-72x72.png resize 72 72
sharp -i icon.svg -o icon-96x96.png resize 96 96
sharp -i icon.svg -o icon-128x128.png resize 128 128
sharp -i icon.svg -o icon-144x144.png resize 144 144
sharp -i icon.svg -o icon-152x152.png resize 152 152
sharp -i icon.svg -o icon-192x192.png resize 192 192
sharp -i icon.svg -o icon-384x384.png resize 384 384
sharp -i icon.svg -o icon-512x512.png resize 512 512
sharp -i icon.svg -o apple-touch-icon.png resize 180 180
sharp -i icon.svg -o favicon-32x32.png resize 32 32
sharp -i icon.svg -o favicon-16x16.png resize 16 16
```

## Required Sizes

- 72x72 - Android notification
- 96x96 - Android shortcuts
- 128x128 - Android splash
- 144x144 - Microsoft tile
- 152x152 - iPad
- 192x192 - Android home screen
- 384x384 - Android splash (large)
- 512x512 - iOS splash, PWA install prompt
- 180x180 - Apple Touch Icon
- 32x32, 16x16 - Browser favicons

## Temporary Fallback

If you don't have PNG generation tools, the PWA will still work with the SVG fallback.
The browser will handle SVG icons for most modern PWA features.
