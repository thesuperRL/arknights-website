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
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Wait for page to load and Cloudflare challenge to complete
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait a bit more for any dynamic content (using Promise instead of deprecated waitForTimeout)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const html = await page.content();
      await browser.close();
      console.log('✅ Successfully fetched with Puppeteer');
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
   * Extracts operator data from the HTML table
   */
  private extractOperators(html: string, rarity: number): OperatorData[] {
    const $ = cheerio.load(html);
    const operators: OperatorData[] = [];

    // Try to find the operator table
    // Common table selectors for wiki tables
    const tableSelectors = [
      'table.wikitable',
      'table.sortable',
      'table.article-table',
      'table',
      '.mw-parser-output table'
    ];

    let table = null;
    for (const selector of tableSelectors) {
      table = $(selector).first();
      if (table.length > 0) {
        console.log(`Found table with selector: ${selector}`);
        break;
      }
    }

    if (!table || table.length === 0) {
      console.warn('No table found. Trying alternative parsing...');
      // Try to find operator cards or list items
      return this.extractOperatorsAlternative($, rarity);
    }

    // First, find the header row to identify column indices
    const headerRow = table.find('tr').first();
    const headerCells = headerRow.find('th, td');
    let globalColumnIndex = -1;
    let classColumnIndex = -1;
    
    headerCells.each((index, cell) => {
      const headerText = $(cell).text().toLowerCase().trim();
      if (headerText.includes('global') || headerText === 'global') {
        globalColumnIndex = index;
        console.log(`Found global column at index: ${globalColumnIndex}`);
      }
      if (headerText.includes('class') || headerText === 'class') {
        classColumnIndex = index;
        console.log(`Found class column at index: ${classColumnIndex}`);
      }
    });

    // Parse table rows (skip header row)
    table.find('tr').each((index, row) => {
      if (index === 0) return; // Skip header

      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 2) return; // Skip rows without enough data

      try {
        // Extract image (usually in first cell)
        const imageCell = cells.eq(0);
        const img = imageCell.find('img').first();
        let imageUrl = img.attr('src') || img.attr('data-src') || '';
        
        // Handle lazy loading images
        if (!imageUrl || imageUrl.includes('data:image')) {
          imageUrl = img.attr('data-src') || img.attr('data-lazy-src') || imageUrl;
        }

        // Extract name (usually in second cell or link)
        const nameCell = cells.eq(1);
        const nameLink = nameCell.find('a').first();
        const name = nameLink.text().trim() || nameCell.text().trim();

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
          cells.each((_cellIndex, cell) => {
            if (operatorClass !== 'Unknown') return; // Already found
            const $cell = $(cell);
            const img = $cell.find('img').first();
            const imgSrc = img.attr('src') || img.attr('data-src') || '';
            // Check if this looks like a class image (contains class names)
            for (const className of classNames) {
              if (imgSrc.includes(`${className}.png`)) {
                operatorClass = className;
                return;
              }
            }
          });
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
          cells.each((_cellIndex, cell) => {
            const $cell = $(cell);
            const img = $cell.find('img').first();
            const imgSrc = img.attr('src') || img.attr('data-src') || '';
            if (imgSrc.includes('Tick.png')) {
              globalValue = true;
            } else if (imgSrc.includes('Cross.png')) {
              globalValue = false;
            }
          });
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
            console.log(`⏭️  Skipping download for ${operator.name} (already has local path: ${operator.profileImage})`);
            skippedCount++;
            continue; // Keep the existing profileImage path
          }
        }
        
        // profileImage contains the URL from scraping, extract extension and download
        const imageUrl = operator.profileImage;
        
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
  // Try different URL formats for 4-star (might be 4_star instead of 4-star)
  let baseUrl = `https://arknights.wiki.gg/wiki/Operator/${rarity}-star`;
  if (rarity === 4) {
    // Try alternative format for 4-star
    baseUrl = `https://arknights.wiki.gg/wiki/Operator/4_star`;
  }

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
    // For 4-star, try the hyphenated version if underscore fails
    if (rarity === 4 && baseUrl.includes('_star')) {
      console.log('\n⚠️  Trying alternative URL format for 4-star...');
      const altScraper = new ArknightsScraper({
        baseUrl: 'https://arknights.wiki.gg/wiki/Operator/4-star',
        rarity: rarity,
        outputDir: path.join(__dirname, '../data'),
        imagesDir: path.join(__dirname, '../public/images/operators')
      });
      try {
        const operatorsDict = await altScraper.scrape();
        const operatorCount = Object.keys(operatorsDict).length;
        console.log(`\n🎉 Successfully scraped ${operatorCount} ${rarity}-star operators!`);
      } catch (altError) {
        console.error('Alternative URL also failed:', altError);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { ArknightsScraper, OperatorData, ScraperConfig };

