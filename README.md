# arknights-website

A Node.js website built with TypeScript.

## Prerequisites

- Node.js (v25.2.1 or higher)
- npm (v11.6.2 or higher)

## Setup

Install dependencies:
```bash
npm install
```

## Development

### Starting the Server

Run the development server:
```bash
npm run dev
```

Or use watch mode for automatic recompilation on file changes:
```bash
npm run watch
```

### Accessing the Website

Once the server is running, open your web browser and navigate to:

**http://localhost:3000**

The server will display a message in the terminal showing the exact URL to visit.

## Building

Compile TypeScript to JavaScript:
```bash
npm run build
```

Run the compiled code:
```bash
npm start
```

## Project Structure

```
arknights-website/
├── src/              # TypeScript source files
│   └── index.ts     # Main entry point (Express server)
├── public/           # Static files (HTML, CSS, JS, images)
│   └── index.html   # Homepage
├── dist/            # Compiled JavaScript (generated)
├── package.json     # Project dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── README.md        # This file
```

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled JavaScript
- `npm run dev` - Run the development server
- `npm run watch` - Watch for changes and auto-reload
- `npm run clean` - Remove the dist directory
- `npm run scrape [rarity]` - Scrape operators of a specific rarity (default: 6)
- `npm run scrape:all` - Scrape operators of all rarities (1-6)

## Dependencies

- **Express** - Web framework for Node.js
- **TypeScript** - Type-safe JavaScript
- **ts-node** - Run TypeScript directly
- **nodemon** - Auto-reload on file changes

## Web Scraping

The project includes a web scraper to extract operator data from the Arknights Wiki.

### Scraping Operators

**Scrape a specific rarity:**
```bash
npm run scrape 6    # Scrape 6-star operators
npm run scrape 5    # Scrape 5-star operators
npm run scrape 4    # Scrape 4-star operators
# etc.
```

**Scrape all rarities:**
```bash
npm run scrape:all
```

### Output

- **Data files**: Saved to `data/operators-{rarity}star.json`
- **Images**: Downloaded to `public/images/operators/`
- **Combined data**: `data/operators-all.json` (when using scrape:all)

Each operator entry includes:
- `id`: Unique identifier
- `name`: Operator name
- `rarity`: Star rating (1-6)
- `class`: Operator class
- `profileImage`: Local path to downloaded image

## Next Steps

1. Add more routes and API endpoints
2. Set up a database connection
3. Add authentication
4. Configure environment variables
5. Add CSS frameworks or build tools
