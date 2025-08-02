import { Book, BookPage } from '../types';
import { segmentTextForPagination } from './textUtils';
import { getResponsivePageSize } from './pageCalculator';

/**
 * Re-paginate a book with new font size settings
 */
export function repaginateBook(book: Book, newFontSize: number): Book {
  console.log('🔄 Repaginating book:', book.title, 'with font size:', newFontSize);
  
  if (!book.content || book.content.trim().length === 0) {
    console.warn('Repagination: No content available for book:', book.title);
    return book;
  }

  // Calculate new page size based on font size
  const newMaxCharsPerPage = getResponsivePageSize(book.content, newFontSize);
  console.log('📐 New chars per page:', newMaxCharsPerPage);

  // Create new pages with updated sizing
  const newPages = createPagesFromContent(book.content, newMaxCharsPerPage);
  
  // Preserve current reading position by finding the closest page
  const newCurrentPage = findClosestPage(book.currentPosition, newPages);
  
  console.log('📄 Repagination complete:', {
    oldPages: book.totalPages,
    newPages: newPages.length,
    oldCurrentPage: book.currentPage,
    newCurrentPage: newCurrentPage
  });

  return {
    ...book,
    pages: newPages,
    totalPages: newPages.length,
    currentPage: newCurrentPage,
  };
}

/**
 * Create pages from content with specified character limit
 */
function createPagesFromContent(content: string, maxCharsPerPage: number): BookPage[] {
  const segments = segmentTextForPagination(content, maxCharsPerPage);
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
    
    currentPosition += segment.length;
  }
  
  return pages.length > 0 ? pages : [{
    pageNumber: 1,
    content: content,
    startPosition: 0,
    endPosition: content.length - 1,
  }];
}

/**
 * Find the page that contains or is closest to the given position
 */
function findClosestPage(position: number, pages: BookPage[]): number {
  if (pages.length === 0) return 1;
  
  // Find the page that contains this position
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (position >= page.startPosition && position <= page.endPosition) {
      return page.pageNumber;
    }
  }
  
  // If not found, find the closest page
  let closestPage = 1;
  let minDistance = Math.abs(position - pages[0].startPosition);
  
  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const distance = Math.abs(position - page.startPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestPage = page.pageNumber;
    }
  }
  
  return closestPage;
}

/**
 * Re-paginate all books in a library with new font size
 */
export function repaginateAllBooks(books: Book[], newFontSize: number): Book[] {
  console.log('🔄 Repaginating all books with font size:', newFontSize);
  
  return books.map(book => repaginateBook(book, newFontSize));
}

/**
 * Check if a book needs repagination based on font size change
 */
export function needsRepagination(book: Book, currentFontSize: number): boolean {
  // If we don't have enough information, assume repagination is needed
  if (!book.pages || book.pages.length === 0) {
    return true;
  }
  
  // Calculate what the page size should be with current font size
  const expectedPageSize = getResponsivePageSize(book.content, currentFontSize);
  
  // Check if the current pagination is significantly different
  const currentAveragePageSize = book.content.length / book.pages.length;
  const sizeDifference = Math.abs(expectedPageSize - currentAveragePageSize);
  
  // If the difference is more than 25%, repagination is recommended
  const threshold = expectedPageSize * 0.25;
  
  console.log('📊 Repagination check:', {
    bookTitle: book.title,
    expectedPageSize,
    currentAveragePageSize,
    sizeDifference,
    threshold,
    needsRepagination: sizeDifference > threshold
  });
  
  return sizeDifference > threshold;
}