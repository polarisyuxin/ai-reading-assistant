import { Chapter, BookPage } from '../types';

/**
 * Detects chapters in the book content based on common chapter patterns
 */
export function detectChapters(content: string, pages: BookPage[]): Chapter[] {
  const chapters: Chapter[] = [];
  
  // Common chapter patterns (English and Chinese)
  const chapterPatterns = [
    // English patterns
    /^Chapter\s+(\d+|[IVXLCDM]+)[:\.\s]?\s*(.*)$/gmi,
    /^第\s*([一二三四五六七八九十百千万\d]+)\s*章[：\.\s]?\s*(.*)$/gmi, // Chinese chapters
    /^第\s*([一二三四五六七八九十百千万\d]+)\s*节[：\.\s]?\s*(.*)$/gmi, // Chinese sections
    /^\d+\.\s+(.+)$/gmi, // Numbered sections
    /^[IVXLCDM]+\.\s+(.+)$/gmi, // Roman numeral chapters
  ];
  
  const lines = content.split('\n');
  let chapterCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.length === 0) continue;
    
    // Check each pattern
    for (const pattern of chapterPatterns) {
      pattern.lastIndex = 0; // Reset regex
      const match = pattern.exec(line);
      
      if (match) {
        chapterCount++;
        const chapterTitle = match[2] || match[1] || `Chapter ${chapterCount}`;
        const linePosition = content.indexOf(line);
        
        // Find which page this chapter starts on
        const startPage = findPageForPosition(linePosition, pages);
        
        const chapter: Chapter = {
          id: `chapter-${chapterCount}`,
          title: chapterTitle.trim() || `Chapter ${chapterCount}`,
          startPage: startPage,
          startPosition: linePosition,
        };
        
        chapters.push(chapter);
        break; // Don't check other patterns for this line
      }
    }
  }
  
  // If no chapters found, create a simple "Chapter 1" for the whole book
  if (chapters.length === 0) {
    chapters.push({
      id: 'chapter-1',
      title: 'Chapter 1',
      startPage: 1,
      startPosition: 0,
    });
  }
  
  // Set end pages for chapters
  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].endPage = chapters[i + 1].startPage - 1;
    } else {
      chapters[i].endPage = pages.length;
    }
  }
  
  console.log(`📚 Detected ${chapters.length} chapters:`, chapters.map(c => c.title));
  
  return chapters;
}

/**
 * Find which page contains a specific character position
 */
function findPageForPosition(position: number, pages: BookPage[]): number {
  for (const page of pages) {
    if (position >= page.startPosition && position <= page.endPosition) {
      return page.pageNumber;
    }
  }
  return 1; // Default to first page if not found
}

/**
 * Get the current chapter based on the current page
 */
export function getCurrentChapter(currentPage: number, chapters: Chapter[]): Chapter | null {
  for (const chapter of chapters) {
    if (currentPage >= chapter.startPage && (!chapter.endPage || currentPage <= chapter.endPage)) {
      return chapter;
    }
  }
  return chapters[0] || null; // Return first chapter as fallback
}