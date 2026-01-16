# G-Code Simulator

A modern web-based G-code simulator with AI-powered editing assistance.

## Features

- 🎯 **XY Tool Path Visualization** - Real-time animated simulation
- 📁 **Multi-format Support** - Load G-code, DXF, and NC files
- 💾 **Save & Export** - Download modified G-code files
- 🤖 **AI Assistant** - Chat with AI for G-code help and modifications
- 📊 **Live Statistics** - Bounding box, line counts, feed rates
- 🎨 **Modern Dark Theme** - Professional glassmorphism UI

## Quick Start

### Local Development
```bash
# Serve with any HTTP server
python3 -m http.server 8080
# Or use npm
npx serve
```

Open http://localhost:8080

### Deploy Worker (for AI features)
```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## Usage

1. **Load G-code**: Click "Load" or paste directly
2. **Import DXF**: Click "DXF" button to convert CAD files
3. **Simulate**: Click play to animate the tool path  
4. **Chat with AI**: Use the chat panel for real-time editing help
5. **Save**: Download your modified G-code

## AI Assistant Examples

- "Add a circle at position 50,50 with radius 20mm"
- "Change the feed rate to 600"
- "Explain what G0 and G1 commands do"
- "Add a 100x50mm rectangle starting at origin"

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS
- **AI Backend**: Cloudflare Workers AI (Llama 2)
- **CAD Support**: Built-in DXF parser

## License

MIT
