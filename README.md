# ARC Lens

Real-time inventory analysis and item advisor for ARC Raiders.

## Features

- **Real-time inventory detection** - Automatically detects when your inventory is open
- **Item recognition** - Uses OCR to read item names from your screen
- **Item advisor** - Provides recommendations on item value and recycling decisions
- **Multi-resolution support** - Works across different screen resolutions (1080p, 1440p, etc.)

## How It Works

ARC Lens uses computer vision (OpenCV.js) and OCR to analyze your screen in real-time:

1. Screen capture via browser's Screen Capture API
2. Menu detection to identify when inventory is open
3. Tooltip detection and text extraction
4. Item matching against game database
5. Value analysis and recommendations

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
npm run dev
```

### Testing

```bash
npm test        # Watch mode
npm run test:run  # Single run
```

### Build

```bash
npm run build
npm run preview
```

## Tech Stack

- React 19
- Vite
- OpenCV.js (computer vision)
- ONNX Runtime (OCR inference)
- Vitest (testing)

## License

Private - All rights reserved
