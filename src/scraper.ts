/**
 * Web scraper for Arknights Wiki to extract operator data
 * Crawls operator pages and downloads images
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// Optional Puppeteer import for Cloudflare bypass
let puppeteer: any = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // Puppeteer not installed, will use axios only
}

interface OperatorData {
  id: string;
  name: string;
  rarity: number;
  class: string;
  global: boolean; // Whether operator is available in global
  profileImage: string; // Local path after download
  niches?: string[]; // Array of tier list niches where this operator appears
  cnName?: string; // Simplified Chinese name
  twName?: string; // Traditional Chinese name
  jpName?: string; // Japanese name
  krName?: string; // Korean name
  characters?: string; // Internal name/filename
}

interface ScraperConfig {
  baseUrl: string;
  rarity: number;
  outputDir: string;
  imagesDir: string;
}

class ArknightsScraper {
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
    // Ensure directories exist
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.config.imagesDir)) {
      fs.mkdirSync(this.config.imagesDir, { recursive: true });
    }
  }

  /**
   * Fetches HTML content using Puppeteer (bypasses Cloudflare)
   */
  private async fetchHtmlWithPuppeteer(url: string): Promise<string> {
    console.log(`Using Puppeteer to fetch: ${url}`);
    let browser;
    
    try {
      // Try to launch with various configurations
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security'
        ]
      };

      // Try to use system Chrome if available (more reliable than bundled Chrome)
      const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(systemChromePath)) {
        console.log('Using system Chrome...');
        browser = await puppeteer.launch({
          ...launchOptions,
          executablePath: systemChromePath
        });
      } else {
        // Fall back to bundled Chrome
        console.log('Using bundled Chrome...');
        browser = await puppeteer.launch(launchOptions);
      }
      
      const page = await browser.newPage();
      
      // Set more realistic browser headers and viewport
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set additional headers to appear more browser-like
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });
      
      // Navigate to the page with longer timeout
      console.log('Navigating to page...');
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
      
      // Wait for Cloudflare challenge to complete - check if we're past the challenge
      let attempts = 0;
      const maxAttempts = 90; // 90 seconds max wait
      while (attempts < maxAttempts) {
        // Try to wait for navigation or specific elements
        try {
          // Wait for tables to appear (indicates page has loaded)
          await page.waitForSelector('table.wikitable, .mw-parser-output table, table', { timeout: 2000 }).catch(() => null);
        } catch (e) {
          // Ignore timeout errors
        }
        
        const html = await page.content();
        // Check if we're past the Cloudflare challenge - look for actual content
        const hasChallenge = html.includes('Just a moment') || html.includes('Just a second') || html.includes('cf-challenge');
        const hasContent = html.includes('<table') || html.includes('wikitable') || html.includes('mw-parser-output');
        
        if (!hasChallenge && hasContent) {
          // Page has loaded with actual content, wait a bit more for dynamic content
          await new Promise(resolve => setTimeout(resolve, 3000));
          const finalHtml = await page.content();
          await browser.close();
          console.log('✅ Successfully fetched with Puppeteer (Cloudflare challenge passed)');
          return finalHtml;
        }
        // Still on challenge page or no content yet, wait and retry
        if (attempts % 5 === 0) {
          console.log(`⏳ Waiting for Cloudflare challenge to complete... (${attempts}s)`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      // If we get here, challenge might still be active, but return the HTML anyway
      console.log('⚠️  Cloudflare challenge may still be active after 90s, but proceeding...');
      const html = await page.content();
      await browser.close();
      return html;
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      
      // If Chrome launch fails, suggest reinstalling
      if (error.message && error.message.includes('Failed to launch')) {
        console.error('\n❌ Puppeteer Chrome launch failed!');
        console.error('Try reinstalling Puppeteer:');
        console.error('  rm -rf node_modules/puppeteer .cache/puppeteer');
        console.error('  npm install puppeteer --save-dev');
        console.error('\nOr use system Chrome by installing Google Chrome browser.');
      }
      throw error;
    }
  }

  /**
   * Fetches HTML content from a URL
   * Note: Cloudflare protection may block requests. If you get 403 errors,
   * the scraper will automatically try Puppeteer if available.
   */
  private async fetchHtml(url: string): Promise<string> {
    try {
      console.log(`Fetching: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://arknights.wiki.gg/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Connection': 'keep-alive',
          'Cache-Control': 'max-age=0'
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Don't throw on 403, we'll handle it
      });
      
      // Check if we got a Cloudflare challenge page
      if (response.status === 403 || (typeof response.data === 'string' && response.data.includes('Just a second'))) {
        // Try Puppeteer if available
        if (puppeteer) {
          console.log('\n⚠️  Cloudflare protection detected, using Puppeteer to bypass...');
          return await this.fetchHtmlWithPuppeteer(url);
        } else {
          console.error('\n❌ Cloudflare protection detected!');
          console.error('The website is blocking automated requests.');
          console.error('\nTo fix this, install Puppeteer:');
          console.error('  npm install puppeteer @types/puppeteer --save-dev');
          console.error('\nOr try again in a few minutes.');
          throw new Error('Cloudflare challenge detected - request blocked');
        }
      }
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.error('\n❌ Cloudflare protection detected!');
        console.error('The website is blocking automated requests.');
        console.error('\nPossible solutions:');
        console.error('1. Wait a few minutes and try again');
        console.error('2. Use a headless browser (Puppeteer/Playwright) to bypass Cloudflare');
        console.error('3. Manually download the HTML page and save it for testing');
      }
      console.error(`Error fetching ${url}:`, error.message || error);
      throw error;
    }
  }

  /**
   * Downloads an image from a URL and saves it locally
   */
  private async downloadImage(imageUrl: string, filename: string): Promise<string> {
    try {
      // Handle relative URLs
      let fullUrl = imageUrl;
      if (imageUrl.startsWith('//')) {
        fullUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        fullUrl = 'https://arknights.wiki.gg' + imageUrl;
      } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        // If it's a relative path without leading slash, add base URL
        fullUrl = 'https://arknights.wiki.gg/' + imageUrl;
      }

      // Ensure filename is safe
      const safeFilename = this.sanitizeFilename(filename.split('.')[0]) + path.extname(filename);
      
      console.log(`Downloading image: ${fullUrl} -> ${safeFilename}`);
      const response = await axios.get(fullUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://arknights.wiki.gg/',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-origin',
          'Connection': 'keep-alive'
        },
        timeout: 30000
      });

      // Ensure images directory exists
      if (!fs.existsSync(this.config.imagesDir)) {
        fs.mkdirSync(this.config.imagesDir, { recursive: true });
      }

      const filePath = path.join(this.config.imagesDir, safeFilename);
      fs.writeFileSync(filePath, response.data);
      console.log(`✅ Saved image: ${filePath}`);
      
      // Return relative path from public directory
      return `/images/operators/${safeFilename}`;
    } catch (error) {
      console.error(`❌ Error downloading image ${imageUrl}:`, error);
      // Return original URL if download fails
      return imageUrl;
    }
  }

  /**
   * Fetches an individual operator page and extracts name data
   */
  private async fetchOperatorNames(operatorName: string): Promise<{
    cnName?: string;
    twName?: string;
    jpName?: string;
    krName?: string;
    characters?: string;
  }> {
    const names: {
      cnName?: string;
      twName?: string;
      jpName?: string;
      krName?: string;
      characters?: string;
    } = {};

    try {
      // Construct the operator page URL
      // The name might need URL encoding (e.g., "Wiś'adel" becomes "Wi%C5%9B%27adel")
      const encodedName = encodeURIComponent(operatorName);
      const operatorUrl = `https://arknights.wiki.gg/wiki/${encodedName}`;
      
      console.log(`  Fetching names from: ${operatorUrl}`);
      
      // Fetch the operator page
      const html = await this.fetchHtml(operatorUrl);
      const $ = cheerio.load(html);

      // Extract names from the druid-data elements
      const cnElement = $('.druid-data-cnname.druid-data-nonempty').first();
      if (cnElement.length > 0) {
        names.cnName = cnElement.text().trim();
      }

      const twElement = $('.druid-data-twname.druid-data-nonempty').first();
      if (twElement.length > 0) {
        names.twName = twElement.text().trim();
      }

      const jpElement = $('.druid-data-jpname.druid-data-nonempty').first();
      if (jpElement.length > 0) {
        names.jpName = jpElement.text().trim();
      }

      const krElement = $('.druid-data-krname.druid-data-nonempty').first();
      if (krElement.length > 0) {
        names.krName = krElement.text().trim();
      }

      // Extract internal name/filename
      const filenameElement = $('.druid-data-filename.druid-data-nonempty').first();
      if (filenameElement.length > 0) {
        names.characters = filenameElement.text().trim();
      }

      // Add delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.warn(`  ⚠️  Failed to fetch names for ${operatorName}: ${error.message}`);
      // Return empty object on error - don't fail the whole scrape
    }

    return names;
  }

  /**
   * Extracts operator data from the HTML table
   */
  private extractOperators(html: string, rarity: number): OperatorData[] {
    const $ = cheerio.load(html);

    // Try to find the operator table
    // Common table selectors for wiki tables
    const tableSelectors = [
      'table.wikitable',
      'table.sortable',
      'table.article-table',
      '.mw-parser-output table.wikitable',
      '.mw-parser-output table.sortable',
      '.mw-parser-output table',
      'table[class*="wikitable"]',
      'table[class*="sortable"]',
      'table',
      '.mw-parser-output table',
      'main table',
      'article table',
      '#mw-content-text table'
    ];

    let table: cheerio.Cheerio<any> | null = null;
    let foundSelector = '';
    
    // Try all selectors
    for (const selector of tableSelectors) {
      const tables = $(selector);
      if (tables.length > 0) {
        // Find the table that likely contains operator data
        // Look for tables with multiple rows and cells
        for (let i = 0; i < tables.length; i++) {
          const $t = $(tables[i]);
          const rows = $t.find('tr');
          if (rows.length >= 2) { // At least header + 1 data row
            const firstRowCells = $(rows[0]).find('th, td');
            if (firstRowCells.length >= 2) { // At least 2 columns
              table = $t;
              foundSelector = selector;
              break;
            }
          }
        }
        if (table && table.length > 0) {
          console.log(`Found table with selector: ${foundSelector} (${table.find('tr').length} rows)`);
          break;
        }
      }
    }

    if (!table || table.length === 0) {
      console.warn('⚠️  No table found with standard selectors. Trying alternative parsing...');
      // Try to find operator cards or list items
      const altResults = this.extractOperatorsAlternative($, rarity);
      if (altResults.length > 0) {
        console.log(`✅ Alternative parsing found ${altResults.length} operators`);
        return altResults;
      }
      
      // Last resort: try to find ANY table and see if it has operator-like data
      console.warn('⚠️  Trying last resort: finding any table with operator-like data...');
      const allTables = $('table');
      if (allTables.length > 0) {
        console.log(`Found ${allTables.length} total tables on page, checking each...`);
        for (let i = 0; i < allTables.length; i++) {
          const $t = $(allTables[i]);
          const rows = $t.find('tr');
          if (rows.length >= 3) { // At least header + 2 data rows
            const testResult = this.tryParseTable($t, rarity);
            if (testResult.length > 0) {
              console.log(`✅ Found valid operator table with ${testResult.length} operators`);
              return testResult;
            }
          }
        }
      }
      
      console.error('❌ Could not find any operator table. Saving HTML for inspection...');
      return [];
    }

    // Parse table rows using the found table
    return this.tryParseTable(table, rarity);
  }

  /**
   * Attempts to parse a table for operator data
   */
  private tryParseTable(table: cheerio.Cheerio<any>, rarity: number): OperatorData[] {
    const $ = cheerio.load('');
    const operators: OperatorData[] = [];

    // First, find the header row to identify column indices
    const headerRow = table.find('tr').first();
    const headerCells = headerRow.find('th, td');
    let globalColumnIndex = -1;
    let classColumnIndex = -1;
    let imageColumnIndex = 0; // Default to first column
    let nameColumnIndex = 1; // Default to second column
    
    headerCells.each((index: number, cell: any) => {
      const headerText = $(cell).text().toLowerCase().trim();
      if (headerText.includes('global') || headerText === 'global') {
        globalColumnIndex = index;
        console.log(`Found global column at index: ${globalColumnIndex}`);
      }
      if (headerText.includes('class') || headerText === 'class') {
        classColumnIndex = index;
        console.log(`Found class column at index: ${classColumnIndex}`);
      }
      if (headerText.includes('operator') || headerText.includes('name') || headerText === '') {
        // Likely the name column
        if (nameColumnIndex === 1 && index > 0) {
          nameColumnIndex = index;
        }
      }
    });

    // Parse table rows (skip header row)
    table.find('tr').each((index, row) => {
      if (index === 0) return; // Skip header

      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 2) return; // Skip rows without enough data

      try {
        // Extract image (try first cell, or any cell with an image)
        let imageUrl = '';
        let imageCell = cells.eq(imageColumnIndex);
        
        // If first cell doesn't have image, search all cells
        if (imageCell.find('img').length === 0) {
          for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
            const $cell = cells.eq(cellIdx);
            const img = $cell.find('img').first();
            if (img.length > 0) {
              imageCell = $cell;
              break;
            }
          }
        }
        
        const img = imageCell.find('img').first();
        imageUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
        
        // Handle relative URLs and lazy loading
        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('//') && !imageUrl.startsWith('/')) {
          imageUrl = '/' + imageUrl;
        }
        
        // Extract name (try name column, or any cell with a link)
        let name = '';
        const nameCell = cells.eq(nameColumnIndex);
        const nameLink = nameCell.find('a').first();
        name = nameLink.text().trim() || nameCell.text().trim();
        
        // If no name found, try all cells for links
        if (!name || name.length === 0) {
          for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
            const $cell = cells.eq(cellIdx);
            const link = $cell.find('a').first();
            const linkText = link.text().trim();
            if (linkText && linkText.length > 0 && linkText.length < 50) { // Reasonable name length
              name = linkText;
              break;
            }
          }
        }

        // Extract class from image (e.g., Sniper.png -> Sniper)
        let operatorClass = 'Unknown';
        if (classColumnIndex >= 0 && cells.length > classColumnIndex) {
          const classCell = cells.eq(classColumnIndex);
          const classImg = classCell.find('img').first();
          const classImgSrc = classImg.attr('src') || classImg.attr('data-src') || '';
          
          // Extract class name from image filename (e.g., "Sniper.png" -> "Sniper")
          if (classImgSrc) {
            const match = classImgSrc.match(/([A-Za-z]+)\.png/i);
            if (match && match[1]) {
              operatorClass = match[1];
            }
          }
        } else {
          // Try to find a cell with class image (fallback)
          const classNames = ['Guard', 'Caster', 'Defender', 'Sniper', 'Support', 'Specialist', 'Vanguard', 'Medic'];
          for (let cellIdx = 0; cellIdx < cells.length && operatorClass === 'Unknown'; cellIdx++) {
            const $cell = cells.eq(cellIdx);
            const img = $cell.find('img').first();
            const imgSrc = img.attr('src') || img.attr('data-src') || '';
            // Check if this looks like a class image (contains class names)
            for (const className of classNames) {
              if (imgSrc.includes(`${className}.png`)) {
                operatorClass = className;
                break;
              }
            }
          }
        }

        // Extract global value from image (Cross.png = false, Tick.png = true)
        let globalValue = false;
        if (globalColumnIndex >= 0 && cells.length > globalColumnIndex) {
          const globalCell = cells.eq(globalColumnIndex);
          const globalImg = globalCell.find('img').first();
          const globalImgSrc = globalImg.attr('src') || globalImg.attr('data-src') || '';
          
          // Check if image is Tick (true) or Cross (false)
          if (globalImgSrc.includes('Tick.png')) {
            globalValue = true;
          } else if (globalImgSrc.includes('Cross.png')) {
            globalValue = false;
          }
        } else {
          // Try to find a cell with Tick or Cross image
          for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
            const $cell = cells.eq(cellIdx);
            const img = $cell.find('img').first();
            const imgSrc = img.attr('src') || img.attr('data-src') || '';
            if (imgSrc.includes('Tick.png')) {
              globalValue = true;
              break;
            } else if (imgSrc.includes('Cross.png')) {
              globalValue = false;
              break;
            }
          }
        }

        if (name && imageUrl) {
          operators.push({
            id: this.generateId(name),
            name: name,
            rarity: rarity,
            class: operatorClass,
            global: globalValue,
            profileImage: imageUrl, // Temporarily store URL, will be replaced with local path after download
            niches: [] // Will be updated by update-ranked-status script
          });
        }
      } catch (error) {
        console.error(`Error parsing row ${index}:`, error);
      }
    });

    return operators;
  }

  /**
   * Alternative extraction method for different page layouts
   */
  private extractOperatorsAlternative($: cheerio.CheerioAPI, rarity: number): OperatorData[] {
    const operators: OperatorData[] = [];

    // Try finding operator cards or list items
    $('.operator-card, .character-card, .mw-parser-output > ul > li').each((_index, element) => {
      const $el = $(element);
      const img = $el.find('img').first();
      const imageUrl = img.attr('src') || img.attr('data-src') || '';
      const nameLink = $el.find('a').first();
      const name = nameLink.text().trim() || $el.find('strong, .name').first().text().trim();
      
      // Extract class from image
      let operatorClass = 'Unknown';
      const classImg = $el.find('.class img, .type img, img[src*=".png"]').filter((_i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        return /(Guard|Caster|Defender|Sniper|Support|Specialist|Vanguard|Medic)\.png/i.test(src);
      }).first();
      
      if (classImg.length > 0) {
        const classImgSrc = classImg.attr('src') || classImg.attr('data-src') || '';
        const match = classImgSrc.match(/([A-Za-z]+)\.png/i);
        if (match && match[1]) {
          operatorClass = match[1];
        }
      }

      // Try to extract global value from alternative layout (check for Tick/Cross images)
      let globalValue = false;
      const globalImg = $el.find('.global img, [data-global] img').first();
      if (globalImg.length > 0) {
        const imgSrc = globalImg.attr('src') || globalImg.attr('data-src') || '';
        if (imgSrc.includes('Tick.png')) {
          globalValue = true;
        } else if (imgSrc.includes('Cross.png')) {
          globalValue = false;
        }
      }

      if (name && imageUrl) {
        operators.push({
          id: this.generateId(name),
          name: name,
          rarity: rarity,
          class: operatorClass,
          global: globalValue,
          profileImage: imageUrl, // Temporarily store URL, will be replaced with local path after download
          niches: [] // Will be updated by update-ranked-status script
        });
      }
    });

    return operators;
  }

  /**
   * Sanitizes filename to remove invalid characters
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  /**
   * Generates a unique ID from operator name
   */
  private generateId(name: string): string {
    return this.sanitizeFilename(name);
  }

  /**
   * Loads existing operators from the JSON file (if it exists)
   * Returns a map of operator ID to operator data
   */
  private loadExistingOperators(): Map<string, OperatorData> {
    const existingFile = path.join(this.config.outputDir, `operators-${this.config.rarity}star.json`);
    const operatorsMap = new Map<string, OperatorData>();
    
    if (fs.existsSync(existingFile)) {
      try {
        const content = fs.readFileSync(existingFile, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Handle dictionary format
        if (!Array.isArray(parsed) && typeof parsed === 'object') {
          for (const [id, operator] of Object.entries(parsed)) {
            operatorsMap.set(id, operator as OperatorData);
          }
          console.log(`📋 Loaded ${operatorsMap.size} existing operators from JSON file`);
        }
      } catch (error) {
        console.warn(`Warning: Could not load existing operators file: ${error}`);
      }
    }
    
    return operatorsMap;
  }

  /**
   * Checks if an operator has all name fields populated
   */
  private hasAllNames(operator: OperatorData): boolean {
    return !!(operator.cnName && operator.twName && operator.jpName && operator.krName);
  }

  /**
   * Loads always-include operators for a specific rarity
   * Supports both array and dictionary formats for backwards compatibility
   */
  private loadAlwaysIncludeOperators(): OperatorData[] {
    const alwaysIncludeFile = path.join(this.config.outputDir, `operators-${this.config.rarity}star-always-include.json`);
    if (fs.existsSync(alwaysIncludeFile)) {
      try {
        const content = fs.readFileSync(alwaysIncludeFile, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Handle dictionary format (new format)
        if (!Array.isArray(parsed) && typeof parsed === 'object') {
          const operators = Object.values(parsed) as OperatorData[];
          console.log(`📋 Loaded ${operators.length} always-include operators (dictionary format)`);
          return operators;
        }
        
        // Handle array format (backwards compatibility)
        if (Array.isArray(parsed)) {
          console.log(`📋 Loaded ${parsed.length} always-include operators (array format)`);
          return parsed;
        }
        
        console.warn(`Warning: Always-include file has unexpected format`);
        return [];
      } catch (error) {
        console.warn(`Warning: Could not load always-include file: ${error}`);
        return [];
      }
    }
    return [];
  }

  /**
   * Converts array of operators to dictionary format (id as key)
   */
  private operatorsToDictionary(operators: OperatorData[]): Record<string, OperatorData> {
    const dict: Record<string, OperatorData> = {};
    for (const operator of operators) {
      dict[operator.id] = operator;
    }
    return dict;
  }

  /**
   * Main scraping function
   */
  async scrape(): Promise<Record<string, OperatorData>> {
    console.log(`Starting scrape for ${this.config.baseUrl}`);
    console.log(`Rarity: ${this.config.rarity}★`);

    try {
      // Load always-include operators
      const alwaysInclude = this.loadAlwaysIncludeOperators();

      // Fetch the HTML
      const html = await this.fetchHtml(this.config.baseUrl);

      // Extract operators from the page
      let operators = this.extractOperators(html, this.config.rarity);

      if (operators.length === 0) {
        console.warn('No operators found. The page structure might be different.');
        console.log('Saving raw HTML for inspection...');
        fs.writeFileSync(
          path.join(this.config.outputDir, `debug-${this.config.rarity}star.html`),
          html
        );
      }

      // Merge with always-include operators (scraped operators take precedence if ID matches)
      const operatorMap = new Map<string, OperatorData>();
      const scrapedCount = operators.length;
      
      // First add always-include operators
      for (const op of alwaysInclude) {
        operatorMap.set(op.id, op);
      }
      
      // Then add/overwrite with scraped operators (scraped takes precedence)
      for (const op of operators) {
        operatorMap.set(op.id, op);
      }

      operators = Array.from(operatorMap.values());
      const alwaysIncludeCount = alwaysInclude.length;
      const totalCount = operators.length;
      console.log(`📊 Total operators after merge: ${totalCount} (${alwaysIncludeCount} always-include, ${scrapedCount} scraped)`);

      // Download images for each operator (skip if already exists)
      console.log(`\nProcessing ${operators.length} operator images...`);
      let downloadedCount = 0;
      let skippedCount = 0;
      
      for (const operator of operators) {
        // Check if profileImage is already a local path (from always-include)
        if (operator.profileImage && operator.profileImage.startsWith('/images/operators/')) {
          const imagePath = path.join(__dirname, '../public', operator.profileImage);
          if (fs.existsSync(imagePath)) {
            console.log(`⏭️  Skipping download for ${operator.name} (image already exists: ${operator.profileImage})`);
            skippedCount++;
            continue; // Keep the existing profileImage path
          } else {
            // Local path specified but file doesn't exist - skip download attempt
            console.log(`⚠️  Image not found at ${operator.profileImage} for ${operator.name}, keeping path as-is`);
            skippedCount++;
            continue; // Keep the path even if file doesn't exist yet
          }
        }
        
        // profileImage contains the URL from scraping, extract extension and download
        const imageUrl = operator.profileImage;
        
        // Skip if it's already a local path (shouldn't happen here, but safety check)
        if (!imageUrl || imageUrl.startsWith('/images/operators/')) {
          console.log(`⏭️  Skipping download for ${operator.name} (already has local path)`);
          skippedCount++;
          continue;
        }
        
        // Extract file extension from URL (remove query parameters first)
        const urlWithoutQuery = imageUrl.split('?')[0].split('#')[0];
        const extension = path.extname(urlWithoutQuery) || '.png';
        const filename = this.sanitizeFilename(operator.name) + extension;
        const imagePath = path.join(this.config.imagesDir, filename);
        const relativeImagePath = `/images/operators/${filename}`;
        
        // Ensure images directory exists
        if (!fs.existsSync(this.config.imagesDir)) {
          fs.mkdirSync(this.config.imagesDir, { recursive: true });
        }
        
        // Check if image already exists
        if (fs.existsSync(imagePath)) {
          console.log(`⏭️  Skipping download for ${operator.name} (image already exists: ${filename})`);
          operator.profileImage = relativeImagePath;
          skippedCount++;
        } else {
          // Download the image (imageUrl is stored in profileImage temporarily)
          operator.profileImage = await this.downloadImage(imageUrl, filename);
          downloadedCount++;
          
          // Add small delay to be respectful to the server
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`\n📊 Image processing complete: ${downloadedCount} downloaded, ${skippedCount} skipped`);

      // Load existing operators to check for existing name data
      const existingOperators = this.loadExistingOperators();
      
      // Fetch name data for each operator (skip if already exists)
      console.log(`\n🌐 Fetching name data for ${operators.length} operators...`);
      let namesFetched = 0;
      let namesSkipped = 0;
      let namesAlreadyExist = 0;
      
      for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        const existingOperator = existingOperators.get(operator.id);
        
        // Check if operator already exists with all names and characters
        if (existingOperator && this.hasAllNames(existingOperator) && existingOperator.characters) {
          // Copy existing names and characters to current operator
          operator.cnName = existingOperator.cnName;
          operator.twName = existingOperator.twName;
          operator.jpName = existingOperator.jpName;
          operator.krName = existingOperator.krName;
          operator.characters = existingOperator.characters;
          namesAlreadyExist++;
          console.log(`[${i + 1}/${operators.length}] ⏭️  Skipping ${operator.name} (names and characters already exist)`);
          continue;
        }
        
        // Check if operator exists but is missing some names - merge what we have
        if (existingOperator) {
          operator.cnName = existingOperator.cnName || operator.cnName;
          operator.twName = existingOperator.twName || operator.twName;
          operator.jpName = existingOperator.jpName || operator.jpName;
          operator.krName = existingOperator.krName || operator.krName;
          operator.characters = existingOperator.characters || operator.characters;
        }
        
        // Check if we need to fetch (missing names or characters)
        const needsFetch = !this.hasAllNames(operator) || !operator.characters;
        
        if (needsFetch) {
          console.log(`[${i + 1}/${operators.length}] Fetching names for ${operator.name}...`);
          
          try {
            const names = await this.fetchOperatorNames(operator.name);
            
            if (names.cnName || names.twName || names.jpName || names.krName || names.characters) {
              // Merge fetched names with existing ones (fetched takes precedence)
              operator.cnName = names.cnName || operator.cnName;
              operator.twName = names.twName || operator.twName;
              operator.jpName = names.jpName || operator.jpName;
              operator.krName = names.krName || operator.krName;
              operator.characters = names.characters || operator.characters;
              namesFetched++;
              console.log(`  ✅ Found names: CN=${names.cnName || operator.cnName || 'N/A'}, TW=${names.twName || operator.twName || 'N/A'}, JP=${names.jpName || operator.jpName || 'N/A'}, KR=${names.krName || operator.krName || 'N/A'}, Internal=${names.characters || operator.characters || 'N/A'}`);
            } else {
              namesSkipped++;
              console.log(`  ⚠️  No name data found for ${operator.name}`);
            }
          } catch (error: any) {
            namesSkipped++;
            console.warn(`  ⚠️  Error fetching names for ${operator.name}: ${error.message}`);
          }
        } else {
          namesAlreadyExist++;
          console.log(`[${i + 1}/${operators.length}] ⏭️  Skipping ${operator.name} (already has all names and characters)`);
        }
      }
      
      console.log(`\n📊 Name fetching complete: ${namesFetched} fetched, ${namesAlreadyExist} already exist, ${namesSkipped} skipped/failed`);

      // Convert to dictionary format
      const operatorsDict = this.operatorsToDictionary(operators);

      // Save operators data to JSON as dictionary
      const outputFile = path.join(this.config.outputDir, `operators-${this.config.rarity}star.json`);
      fs.writeFileSync(outputFile, JSON.stringify(operatorsDict, null, 2));
      console.log(`\n✅ Saved ${operators.length} operators to ${outputFile} (as dictionary)`);

      return operatorsDict;
    } catch (error) {
      console.error('Error during scraping:', error);
      throw error;
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const rarity = parseInt(process.argv[2]) || 6;
  // Use standard URL format for all rarities
  let baseUrl = `https://arknights.wiki.gg/wiki/Operator/${rarity}-star`;

  const scraper = new ArknightsScraper({
    baseUrl: baseUrl,
    rarity: rarity,
    outputDir: path.join(__dirname, '../data'),
    imagesDir: path.join(__dirname, '../public/images/operators')
  });

  try {
    const operatorsDict = await scraper.scrape();
    const operatorCount = Object.keys(operatorsDict).length;
    console.log(`\n🎉 Successfully scraped ${operatorCount} ${rarity}-star operators!`);
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { ArknightsScraper, OperatorData, ScraperConfig };

