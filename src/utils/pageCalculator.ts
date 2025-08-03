import { Dimensions, Platform } from 'react-native';
import { detectPrimaryLanguage } from './textUtils';

export interface PageCalculationParams {
  fontSize: number;
  screenWidth?: number;
  screenHeight?: number;
  headerHeight?: number;
  audioControlsHeight?: number;
  padding?: number;
}

export interface PageSizeResult {
  charsPerPage: number;
  linesPerPage: number;
  charsPerLine: number;
  availableHeight: number;
  availableWidth: number;
  language: 'english' | 'chinese' | 'mixed';
}

/**
 * Calculates optimal page size based on screen dimensions and font settings
 */
export function calculateDynamicPageSize(
  content: string,
  params: PageCalculationParams
): PageSizeResult {
  const screen = Dimensions.get('window');
  
  // Use provided dimensions or default to screen dimensions
  const screenWidth = params.screenWidth || screen.width;
  const screenHeight = params.screenHeight || screen.height;
  
  // Default layout measurements (approximate)
  const headerHeight = params.headerHeight || 120; // Header with book info
  const audioControlsHeight = params.audioControlsHeight || 80; // Audio controls at bottom
  const padding = params.padding || 40; // 20px padding on each side
  const statusBarHeight = 50; // Approximate status bar height
  const tabBarHeight = 80; // Bottom tab navigation
  
  // Calculate available text area
  const availableWidth = screenWidth - padding;
  const availableHeight = screenHeight - headerHeight - audioControlsHeight - statusBarHeight - tabBarHeight - padding;
  
  // Detect language for character width estimation
  const language = detectPrimaryLanguage(content);
  
  // Font metrics estimation based on fontSize (iOS needs different line height)
  const lineHeight = Platform.OS === 'ios' ? params.fontSize * 1.6 : params.fontSize * 1.75;
  const charWidth = getCharacterWidth(params.fontSize, language);
  
  // Calculate layout
  const linesPerPage = Math.floor(availableHeight / lineHeight);
  const charsPerLine = Math.floor(availableWidth / charWidth);
  const charsPerPage = linesPerPage * charsPerLine;
  
  // Apply language-specific adjustments
  const adjustedCharsPerPage = applyLanguageAdjustments(charsPerPage, language);
  
  console.log('📐 Dynamic Page Size Calculation:', {
    fontSize: params.fontSize,
    screenDimensions: { width: screenWidth, height: screenHeight },
    availableDimensions: { width: availableWidth, height: availableHeight },
    language,
    lineHeight,
    charWidth,
    linesPerPage,
    charsPerLine,
    charsPerPage: adjustedCharsPerPage
  });
  
  return {
    charsPerPage: adjustedCharsPerPage,
    linesPerPage,
    charsPerLine,
    availableHeight,
    availableWidth,
    language
  };
}

/**
 * Estimates character width based on font size and language
 */
function getCharacterWidth(fontSize: number, language: 'english' | 'chinese' | 'mixed'): number {
  // Base character width as a ratio of font size
  let baseRatio: number;
  
  switch (language) {
    case 'chinese':
      // Chinese characters are typically wider and more square
      baseRatio = Platform.OS === 'ios' ? 1.1 : 1.0;
      break;
    case 'mixed':
      // Mixed content, average between English and Chinese
      baseRatio = Platform.OS === 'ios' ? 0.8 : 0.75;
      break;
    case 'english':
    default:
      // English characters are typically narrower, iOS renders slightly wider
      baseRatio = Platform.OS === 'ios' ? 0.65 : 0.6;
      break;
  }
  
  return fontSize * baseRatio;
}

/**
 * Apply language-specific adjustments for better readability
 */
function applyLanguageAdjustments(charsPerPage: number, language: 'english' | 'chinese' | 'mixed'): number {
  switch (language) {
    case 'chinese':
      // Chinese text is denser, reduce by 15% for better readability
      return Math.floor(charsPerPage * 0.85);
    case 'mixed':
      // Mixed content, slight reduction for comfort
      return Math.floor(charsPerPage * 0.9);
    case 'english':
    default:
      // English text can use full calculated space
      return charsPerPage;
  }
}

/**
 * Get responsive page size that adapts to current settings
 */
export function getResponsivePageSize(content: string, fontSize: number): number {
  const pageCalc = calculateDynamicPageSize(content, { fontSize });
  
  // Ensure minimum and maximum bounds
  const minCharsPerPage = 200; // Minimum readable page size
  const maxCharsPerPage = 3000; // Maximum to prevent overly long pages
  
  return Math.max(minCharsPerPage, Math.min(maxCharsPerPage, pageCalc.charsPerPage));
}

/**
 * Calculate optimal page size for different screen orientations
 */
export function getOrientationAwarePageSize(
  content: string, 
  fontSize: number, 
  isLandscape: boolean = false
): number {
  const screen = Dimensions.get('window');
  
  // Adjust dimensions for orientation
  const screenWidth = isLandscape ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const screenHeight = isLandscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  
  const pageCalc = calculateDynamicPageSize(content, {
    fontSize,
    screenWidth,
    screenHeight,
    // Landscape mode typically has less vertical UI elements
    headerHeight: isLandscape ? 80 : 120,
    audioControlsHeight: isLandscape ? 60 : 80
  });
  
  return pageCalc.charsPerPage;
}