import { countWords } from './textUtils';

/**
 * Calculate reading time based on content and reading speed
 */
export function calculateReadingTime(content: string, wordsPerMinute: number = 200): number {
  const wordCount = countWords(content).words;
  return Math.ceil(wordCount / wordsPerMinute); // Return time in minutes
}

/**
 * Calculate reading time for a specific page range
 */
export function calculatePageRangeTime(pages: any[], startPage: number, endPage: number, wordsPerMinute: number = 200): number {
  if (!pages || pages.length === 0 || wordsPerMinute <= 0) {
    return 0;
  }
  
  let totalContent = '';
  
  for (let i = startPage - 1; i < Math.min(endPage, pages.length); i++) {
    if (pages[i] && pages[i].content) {
      totalContent += pages[i].content + ' ';
    }
  }
  
  if (!totalContent.trim()) {
    return 0;
  }
  
  return calculateReadingTime(totalContent, wordsPerMinute);
}

/**
 * Calculate elapsed time based on current progress
 */
export function calculateElapsedTime(pages: any[], currentPage: number, wordsPerMinute: number = 200): number {
  if (!pages || pages.length === 0 || currentPage <= 0) {
    return 0;
  }
  return calculatePageRangeTime(pages, 1, currentPage, wordsPerMinute);
}

/**
 * Calculate remaining time based on current progress
 */
export function calculateRemainingTime(pages: any[], currentPage: number, totalPages: number, wordsPerMinute: number = 200): number {
  if (!pages || pages.length === 0 || currentPage >= totalPages) {
    return 0;
  }
  return calculatePageRangeTime(pages, currentPage + 1, totalPages, wordsPerMinute);
}

/**
 * Format time in MM:SS format
 */
export function formatTime(minutes: number): string {
  // Handle invalid input
  if (!minutes || isNaN(minutes) || minutes < 0) {
    return '0:00';
  }
  
  const totalSeconds = Math.max(0, minutes * 60);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Calculate words per minute based on speech rate
 * 1.0x = 160 WPM (conservative base rate to account for pauses)
 * Reduced from 200 to better match actual TTS timing
 */
export function calculateWordsPerMinute(speechRate: number): number {
  return Math.round(160 * speechRate);
}