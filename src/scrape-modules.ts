/**
 * Script to scrape operator module images from Arknights Wiki
 * Downloads module images and saves them with module codes as filenames
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

interface ModuleInfo {
  code: string;
  imageUrl: string;
}

async function fetchHtmlWithPuppeteer(url: string): Promise<string> {
  console.log(`Using Puppeteer to fetch: ${url}`);
  let browser;
  
  try {
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

    // Try to use system Chrome if available
    const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(systemChromePath)) {
      console.log('Using system Chrome...');
      launchOptions.executablePath = systemChromePath;
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating to page...');
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Wait a bit for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const html = await page.content();
    await browser.close();
    
    return html;
  } catch (error: any) {
    if (browser) {
      await browser.close();
    }
    console.error('Puppeteer error:', error.message || error);
    throw error;
  }
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
      validateStatus: (status) => status < 500
    });
    
    // Check if we got a Cloudflare challenge page
    if (response.status === 403 || (typeof response.data === 'string' && response.data.includes('Just a second'))) {
      if (puppeteer) {
        console.log('\n⚠️  Cloudflare protection detected, using Puppeteer to bypass...');
        return await fetchHtmlWithPuppeteer(url);
      } else {
        console.error('\n❌ Cloudflare protection detected!');
        console.error('The website is blocking automated requests.');
        console.error('\nTo fix this, install Puppeteer:');
        console.error('  npm install puppeteer @types/puppeteer --save-dev');
        throw new Error('Cloudflare challenge detected - request blocked');
      }
    }
    
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 403) {
      if (puppeteer) {
        console.log('\n⚠️  Cloudflare protection detected, using Puppeteer to bypass...');
        return await fetchHtmlWithPuppeteer(url);
      } else {
        console.error('\n❌ Cloudflare protection detected!');
        console.error('The website is blocking automated requests.');
        console.error('\nTo fix this, install Puppeteer:');
        console.error('  npm install puppeteer @types/puppeteer --save-dev');
      }
    }
    console.error(`Error fetching ${url}:`, error.message || error);
    throw error;
  }
}

async function downloadImage(imageUrl: string, filename: string, outputDir: string): Promise<string> {
  try {
    // Handle relative URLs
    let fullUrl = imageUrl;
    if (imageUrl.startsWith('//')) {
      fullUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      fullUrl = 'https://arknights.wiki.gg' + imageUrl;
    } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      fullUrl = 'https://arknights.wiki.gg/' + imageUrl;
    }

    // Get the full resolution image URL (remove thumbnail parameters)
    // The URL might have thumbnail parameters like /23px-CHA-X_module.png
    // We want the full image, so try to get the original
    if (fullUrl.includes('/thumb/')) {
      // Extract the original image path from thumbnail URL
      // Format: /images/thumb/path/to/image.png/23px-image.png
      const match = fullUrl.match(/\/images\/thumb\/(.+?)\/\d+px-/);
      if (match) {
        fullUrl = 'https://arknights.wiki.gg/images/' + match[1];
      }
    }

    // Remove query parameters
    fullUrl = fullUrl.split('?')[0];

    console.log(`Downloading: ${fullUrl} -> ${filename}`);
    
    const response = await axios.get(fullUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://arknights.wiki.gg/',
      },
      timeout: 30000
    });

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, response.data);
    console.log(`✅ Saved: ${filePath}`);
    
    return filePath;
  } catch (error: any) {
    console.error(`❌ Failed to download ${imageUrl}:`, error.message || error);
    throw error;
  }
}

function sanitizeFilename(filename: string): string {
  // Remove invalid characters for filenames
  return filename.replace(/[<>:"/\\|?*]/g, '_').trim();
}

async function scrapeModules(): Promise<void> {
  const url = 'https://arknights.wiki.gg/wiki/Operator_Module';
  const outputDir = path.join(__dirname, '../public/images/modules');
  
  console.log('🔍 Fetching module page...');
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const modules: ModuleInfo[] = [];

  // Find the section with class "tabber__section"
  const section = $('section.tabber__section').first();
  
  if (section.length === 0) {
    console.error('❌ Could not find tabber__section');
    return;
  }

  console.log('📋 Found tabber section, searching for modules...');

  // Find all article elements with class "tabber__panel" within the section
  section.find('article.tabber__panel').each((_, panel) => {
    const $panel = $(panel);
    
    // Find all td elements with the specific style
    $panel.find('td[style*="background:var(--theme-th-background)"]').each((_, td) => {
      const $td = $(td);
      
      // Find the img tag
      const $img = $td.find('img').first();
      if ($img.length === 0) return;
      
      // Get image source
      let imageUrl = $img.attr('src') || $img.attr('data-src') || '';
      if (!imageUrl) return;
      
      // Get the full resolution image URL from srcset if available
      const srcset = $img.attr('srcset');
      if (srcset) {
        // srcset format: "url1 1.5x, url2 2x"
        // Try to get the 2x version for better quality
        const matches = srcset.match(/([^\s,]+)\s+2x/);
        if (matches && matches[1]) {
          imageUrl = matches[1];
        } else {
          // Fall back to first URL in srcset
          const firstMatch = srcset.match(/([^\s,]+)/);
          if (firstMatch && firstMatch[1]) {
            imageUrl = firstMatch[1];
          }
        }
      }
      
      // Find the div with the module code (the one with <b> tag)
      // The module code div should be the one with margin-top:5px style
      const $div = $td.find('div[style*="margin-top:5px"]').first();
      
      if ($div.length === 0) return;
      
      const moduleCode = $div.find('b').first().text().trim();
      if (!moduleCode) return;
      
      // Filter out class names - module codes are typically 3-4 letters followed by -X, -Y, or -Δ
      // Examples: CHA-X, SPC-Y, MSC-Δ, CCR-X, etc.
      // Class names are longer and don't match this pattern
      const moduleCodePattern = /^[A-Z]{2,4}-[XYΔ]$/;
      if (!moduleCodePattern.test(moduleCode)) {
        // Skip class names, only keep module codes
        return;
      }
      
      modules.push({
        code: moduleCode,
        imageUrl: imageUrl
      });
      
      console.log(`  Found module: ${moduleCode}`);
    });
  });

  console.log(`\n📦 Found ${modules.length} modules`);
  console.log('📥 Downloading images...\n');

  let successCount = 0;
  let failCount = 0;

  for (const module of modules) {
    try {
      // Create filename: MODULE_CODE_module.png
      const filename = `${sanitizeFilename(module.code)}_module.png`;
      
      await downloadImage(module.imageUrl, filename, outputDir);
      successCount++;
      
      // Be respectful - wait a bit between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      failCount++;
      console.error(`Failed to download ${module.code}:`, error);
    }
  }

  console.log(`\n✅ Successfully downloaded ${successCount} module images`);
  if (failCount > 0) {
    console.log(`❌ Failed to download ${failCount} module images`);
  }
  console.log(`📁 Images saved to: ${outputDir}`);
}

// Run the scraper
scrapeModules().catch(console.error);
