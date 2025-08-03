import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import { BookPage, Chapter } from '../types';
import { segmentTextForPagination, detectPrimaryLanguage, countWords } from '../utils/textUtils';
import { getResponsivePageSize } from '../utils/pageCalculator';
import { readFileContent, isWebBlobUrl } from '../utils/webFileReader';
import { detectChapters } from '../utils/chapterUtils';

export interface ParsedBook {
  title: string;
  author?: string;
  content: string;
  pages: BookPage[];
  chapters: Chapter[];
}

export class FileParser {
  private static readonly WORDS_PER_PAGE = 300; // Approximate words per page (for English)
  private static readonly CHARS_PER_WORD = 5; // Average characters per word (for English)
  private static readonly CHARS_PER_PAGE_ENGLISH = FileParser.WORDS_PER_PAGE * FileParser.CHARS_PER_WORD; // ~1500 chars
  private static readonly CHARS_PER_PAGE_CHINESE = 800; // Chinese text is denser, fewer chars per page for readability
  private static readonly CHARS_PER_PAGE_MIXED = 1000; // Mixed text

  private static createPages(content: string, fontSize: number = 16): BookPage[] {
    console.log('createPages: Input content length:', content.length);
    
    if (!content || content.trim().length === 0) {
      console.log('createPages: Empty content, creating single empty page');
      return [{
        pageNumber: 1,
        content: 'No content available',
        startPosition: 0,
        endPosition: 0,
      }];
    }

    const cleanContent = content.trim();
    
    // Detect language to determine optimal pagination strategy
    const language = detectPrimaryLanguage(cleanContent);
    const wordStats = countWords(cleanContent);
    
    console.log('createPages: Language detected:', language);
    console.log('createPages: Text stats:', wordStats);
    console.log('createPages: Font size:', fontSize);
    
    // Use dynamic page size calculation based on font size and screen dimensions
    const maxCharsPerPage = getResponsivePageSize(cleanContent, fontSize);
    
    console.log('createPages: Dynamic chars per page:', maxCharsPerPage);

    // For very short content, create a single page
    if (cleanContent.length <= maxCharsPerPage) {
      console.log('createPages: Short content, creating single page');
      return [{
        pageNumber: 1,
        content: cleanContent,
        startPosition: 0,
        endPosition: cleanContent.length - 1,
      }];
    }

    // Use smart segmentation that handles Chinese text properly
    const segments = segmentTextForPagination(cleanContent, maxCharsPerPage);
    const pages: BookPage[] = [];
    let currentPosition = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const startPosition = currentPosition;
      const endPosition = currentPosition + segment.length - 1;
      
      pages.push({
        pageNumber: i + 1,
        content: segment,
        startPosition,
        endPosition,
      });
      
      console.log(`createPages: Created page ${i + 1} with ${segment.length} characters`);
      currentPosition += segment.length;
    }
    
    // Ensure we have at least one page
    if (pages.length === 0) {
      console.log('createPages: No pages created, using full content as single page');
      pages.push({
        pageNumber: 1,
        content: cleanContent,
        startPosition: 0,
        endPosition: cleanContent.length - 1,
      });
    }
    
    console.log('createPages: Total pages created:', pages.length);
    return pages;
  }

  static async parseFile(uri: string, fileName: string, fontSize: number = 16): Promise<ParsedBook> {
    const fileExtension = fileName.toLowerCase().split('.').pop();
    
    switch (fileExtension) {
      case 'txt':
        return this.parseTXT(uri, fileName, fontSize);
      case 'pdf':
        return this.parsePDF(uri, fileName, fontSize);
      case 'epub':
        return this.parseEPUB(uri, fileName, fontSize);
      default:
        throw new Error(`Unsupported file format: ${fileExtension}`);
    }
  }

  private static async parseTXT(uri: string, fileName: string, fontSize: number = 16): Promise<ParsedBook> {
    try {
      console.log('Parsing TXT file:', fileName, 'from URI:', uri, 'Platform:', Platform.OS);
      
      // Use web-compatible file reader
      const fileResult = await readFileContent(uri, fileName);
      const content = fileResult.content;
      
      const title = fileName.replace(/\.[^/.]+$/, '');
      
      console.log('TXT content length:', content.length);
      console.log('TXT content preview:', content.substring(0, 200) + '...');
      
      if (!content || content.trim().length === 0) {
        throw new Error('The text file appears to be empty');
      }
      
      const trimmedContent = content.trim();
      const pages = this.createPages(trimmedContent, fontSize);
      const chapters = detectChapters(trimmedContent, pages);
      
      console.log('TXT pages created:', pages.length);
      console.log('TXT chapters detected:', chapters.length);
      console.log('First page preview:', pages[0]?.content.substring(0, 100) + '...');
      
      return {
        title,
        content: trimmedContent,
        pages,
        chapters,
      };
    } catch (error) {
      console.error('TXT parsing error:', error);
      throw new Error(`Failed to parse TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async parsePDF(_uri: string, fileName: string, fontSize: number = 16): Promise<ParsedBook> {
    const title = fileName.replace(/\.[^/.]+$/, '');
    
    // PDF parsing in React Native/Expo is complex due to compatibility issues
    // Most PDF parsing libraries require native modules or use features not supported in Hermes
    const content = `📄 PDF Support Information

The file "${fileName}" is a PDF document.

Due to React Native/Expo limitations, full PDF text extraction is not currently supported in this app. PDF parsing libraries typically require:
• Native modules (not available in Expo)
• Node.js features not supported in mobile environments
• Advanced JavaScript features not compatible with Hermes engine

🔧 Recommended Solutions:

1. **Convert to Text**: Use online tools or desktop software to convert your PDF to a .txt file
   - Google Docs: Upload PDF → Download as Plain Text (.txt)
   - Adobe Acrobat: Export as Text
   - Online converters: PDF24, SmallPDF, etc.

2. **Convert to EPUB**: Use calibre or similar tools to convert PDF to EPUB format
   - Download calibre (free e-book management tool)
   - Add PDF → Convert books → Output format: EPUB

3. **Use Text Selection**: Copy text from PDF viewer and save as .txt file

Once converted, you can import the .txt or .epub file into this app for full text-to-speech and AI features.

💡 Tip: For best results with text-to-speech, .txt files work perfectly and load fastest.

We apologize for this limitation and appreciate your understanding!`;
    
    const pages = this.createPages(content, fontSize);
    
    const chapters = detectChapters(content, pages);
    
    return {
      title: `${title} (PDF - Conversion Needed)`,
      content,
      pages,
      chapters,
    };
  }

  private static async parseEPUB(uri: string, fileName: string, fontSize: number = 16): Promise<ParsedBook> {
    try {
      console.log('Parsing EPUB file:', fileName, 'from URI:', uri, 'Platform:', Platform.OS);
      
      let zip: JSZip;
      
      if (Platform.OS === 'web') {
        // On web, fetch the file as a blob and load with JSZip
        const response = await fetch(uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        zip = await JSZip.loadAsync(arrayBuffer);
      } else {
        // On mobile, read as base64 and load with JSZip
        const base64Content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip = await JSZip.loadAsync(base64Content, { base64: true });
      }
      
      // Parse metadata from META-INF/container.xml
      const containerXml = await zip.file('META-INF/container.xml')?.async('string');
      if (!containerXml) {
        throw new Error('Invalid EPUB: missing container.xml');
      }
      
      // Extract the OPF file path
      const opfMatch = containerXml.match(/full-path="([^"]+)"/);
      if (!opfMatch) {
        throw new Error('Invalid EPUB: cannot find OPF file');
      }
      
      const opfPath = opfMatch[1];
      const opfContent = await zip.file(opfPath)?.async('string');
      if (!opfContent) {
        throw new Error('Invalid EPUB: cannot read OPF file');
      }
      
      // Extract title and author from OPF
      const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
      
      const title = titleMatch ? titleMatch[1] : fileName.replace(/\.[^/.]+$/, '');
      const author = authorMatch ? authorMatch[1] : undefined;
      
      // Extract spine order
      const spineMatches = opfContent.match(/<itemref[^>]+idref="([^"]+)"/g) || [];
      const spineIds = spineMatches.map(match => {
        const idMatch = match.match(/idref="([^"]+)"/);
        return idMatch ? idMatch[1] : '';
      }).filter(id => id);
      
      // Get manifest items
      const manifestMatches = opfContent.match(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g) || [];
      const manifestMap: { [key: string]: string } = {};
      
      manifestMatches.forEach(match => {
        const idMatch = match.match(/id="([^"]+)"/);
        const hrefMatch = match.match(/href="([^"]+)"/);
        if (idMatch && hrefMatch) {
          manifestMap[idMatch[1]] = hrefMatch[1];
        }
      });
      
      // Extract content from HTML files in spine order
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) + '/' : '';
      let content = '';
      
      for (const spineId of spineIds) {
        const href = manifestMap[spineId];
        if (href && (href.endsWith('.html') || href.endsWith('.xhtml'))) {
          const filePath = opfDir + href;
          const htmlContent = await zip.file(filePath)?.async('string');
          if (htmlContent) {
            // Extract text content from HTML (basic text extraction)
            const textContent = htmlContent
              .replace(/<[^>]*>/g, ' ') // Remove HTML tags
              .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
              .replace(/&amp;/g, '&') // Replace &amp; with &
              .replace(/&lt;/g, '<') // Replace &lt; with <
              .replace(/&gt;/g, '>') // Replace &gt; with >
              .replace(/&quot;/g, '"') // Replace &quot; with "
              .replace(/\s+/g, ' ') // Replace multiple spaces with single space
              .trim();
            
            if (textContent) {
              content += textContent + '\n\n';
            }
          }
        }
      }
      
      if (!content.trim()) {
        throw new Error('No readable content found in EPUB');
      }
      
      const trimmedContent = content.trim();
      const pages = this.createPages(trimmedContent, fontSize);
      const chapters = detectChapters(trimmedContent, pages);
      
      return {
        title,
        author,
        content: trimmedContent,
        pages,
        chapters,
      };
      
    } catch (error) {
      console.error('EPUB parsing error:', error);
      throw new Error(`Failed to parse EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}