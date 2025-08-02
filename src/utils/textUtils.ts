// Text processing utilities with Chinese language support

export interface TextSegment {
  text: string;
  isChineseText: boolean;
}

/**
 * Detects if text contains Chinese characters
 */
export const containsChinese = (text: string): boolean => {
  // Unicode ranges for Chinese characters:
  // 4E00-9FFF: CJK Unified Ideographs (most common Chinese characters)
  // 3400-4DBF: CJK Extension A
  // 20000-2A6DF: CJK Extension B
  // F900-FAFF: CJK Compatibility Ideographs
  // 2F800-2FA1F: CJK Compatibility Supplement
  const chineseRegex = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  return chineseRegex.test(text);
};

/**
 * Estimates reading difficulty level based on Chinese content
 */
export const getChineseTextComplexity = (text: string): 'basic' | 'intermediate' | 'advanced' => {
  const chineseChars = text.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || [];
  const chineseRatio = chineseChars.length / text.length;
  
  if (chineseRatio < 0.3) return 'basic';
  if (chineseRatio < 0.7) return 'intermediate';
  return 'advanced';
};

/**
 * Smart word/character counting for mixed Chinese-English text
 */
export const countWords = (text: string): { words: number; characters: number; chineseChars: number } => {
  const cleanText = text.trim();
  
  // Count Chinese characters
  const chineseChars = (cleanText.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
  
  // For Chinese text, each character is typically considered a "word unit"
  // For mixed text, we count English words normally and Chinese characters as individual units
  const englishText = cleanText.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, ' ');
  const englishWords = englishText.trim() ? englishText.trim().split(/\s+/).length : 0;
  
  // Total "words" = English words + Chinese characters
  const totalWords = englishWords + chineseChars;
  
  return {
    words: totalWords,
    characters: cleanText.length,
    chineseChars,
  };
};

/**
 * Smart text splitting for mixed Chinese-English content
 * Returns the first N "words" (English words + Chinese characters)
 */
export const getFirstNWords = (text: string, n: number): string => {
  if (!text || n <= 0) return '';
  
  const cleanText = text.trim();
  let wordCount = 0;
  let result = '';
  let i = 0;
  
  while (i < cleanText.length && wordCount < n) {
    const char = cleanText[i];
    
    // Check if current character is Chinese
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(char)) {
      // Chinese character counts as 1 word
      result += char;
      wordCount++;
      i++;
    } else if (/\s/.test(char)) {
      // Skip whitespace
      result += char;
      i++;
    } else {
      // English text - collect the entire word
      let word = '';
      while (i < cleanText.length && !/\s/.test(cleanText[i]) && !/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(cleanText[i])) {
        word += cleanText[i];
        i++;
      }
      
      if (word.length > 0 && wordCount < n) {
        result += word;
        wordCount++;
      }
    }
  }
  
  return result.trim();
};

/**
 * Smart text segmentation for pagination
 * Better handles Chinese text without breaking mid-sentence
 */
export const segmentTextForPagination = (text: string, maxCharsPerPage: number): string[] => {
  if (!text || text.trim().length === 0) {
    return [''];
  }
  
  const cleanText = text.trim();
  const segments: string[] = [];
  
  // Split by paragraphs first (Chinese text often uses different paragraph markers)
  const paragraphs = cleanText.split(/\n\s*\n|\r\n\s*\r\n/);
  
  let currentSegment = '';
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (trimmedParagraph.length === 0) continue;
    
    // Check if adding this paragraph would exceed the limit
    const potentialSegment = currentSegment + (currentSegment ? '\n\n' : '') + trimmedParagraph;
    
    if (potentialSegment.length <= maxCharsPerPage) {
      currentSegment = potentialSegment;
    } else {
      // If current segment has content, save it
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = '';
      }
      
      // Handle very long paragraphs
      if (trimmedParagraph.length > maxCharsPerPage) {
        const subSegments = breakLongParagraph(trimmedParagraph, maxCharsPerPage);
        segments.push(...subSegments);
      } else {
        currentSegment = trimmedParagraph;
      }
    }
  }
  
  // Add the last segment if it has content
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments.length > 0 ? segments : [''];
};

/**
 * Breaks long paragraphs intelligently for Chinese text
 */
const breakLongParagraph = (paragraph: string, maxChars: number): string[] => {
  const segments: string[] = [];
  let current = '';
  
  // For Chinese text, try to break at punctuation marks
  const chinesePunctuation = /[。！？；：，、]/;
  const englishPunctuation = /[.!?;:,]/;
  
  let i = 0;
  while (i < paragraph.length) {
    current += paragraph[i];
    
    // If we're near the limit, look for a good break point
    if (current.length >= maxChars * 0.8) {
      let breakPoint = -1;
      
      // Look ahead for punctuation within the remaining allowable characters
      for (let j = i + 1; j < Math.min(paragraph.length, i + (maxChars - current.length)); j++) {
        if (chinesePunctuation.test(paragraph[j]) || englishPunctuation.test(paragraph[j])) {
          breakPoint = j;
        }
      }
      
      if (breakPoint > -1) {
        // Include the punctuation mark
        current += paragraph.substring(i + 1, breakPoint + 1);
        segments.push(current.trim());
        current = '';
        i = breakPoint + 1;
        continue;
      }
    }
    
    // Hard break if we exceed the limit
    if (current.length >= maxChars) {
      segments.push(current.trim());
      current = '';
    }
    
    i++;
  }
  
  if (current.trim().length > 0) {
    segments.push(current.trim());
  }
  
  return segments;
};

/**
 * Detects the primary language of the text
 */
export const detectPrimaryLanguage = (text: string): 'chinese' | 'english' | 'mixed' => {
  const totalChars = text.length;
  const chineseChars = (text.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
  const chineseRatio = chineseChars / totalChars;
  
  if (chineseRatio > 0.6) return 'chinese';
  if (chineseRatio < 0.1) return 'english';
  return 'mixed';
};