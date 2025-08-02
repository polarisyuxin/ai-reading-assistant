import { Platform } from 'react-native';

/**
 * Web-compatible file reading utilities
 * Handles differences between mobile and web file access
 */

export interface WebFileResult {
  content: string;
  fileName: string;
  size: number;
}

/**
 * Read file content from URI or File object
 * Handles both mobile (file URI) and web (Blob URL/File) platforms
 */
export async function readFileContent(uri: string, fileName: string): Promise<WebFileResult> {
  console.log('📁 Reading file:', fileName, 'URI:', uri, 'Platform:', Platform.OS);
  
  if (Platform.OS === 'web') {
    return readWebFile(uri, fileName);
  } else {
    return readMobileFile(uri, fileName);
  }
}

/**
 * Read file on web platform using Fetch API or FileReader
 */
async function readWebFile(uri: string, fileName: string): Promise<WebFileResult> {
  try {
    console.log('🌐 Reading web file:', uri);
    
    // Try to fetch the file as a blob first
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const content = await blobToText(blob);
    
    console.log('🌐 Web file read successfully:', {
      fileName,
      size: blob.size,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...'
    });
    
    return {
      content,
      fileName,
      size: blob.size
    };
  } catch (error) {
    console.error('🌐 Web file read error:', error);
    throw new Error(`Failed to read file on web: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert Blob to text content
 */
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader result is not a string'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read blob as text'));
    };
    
    // Try to read as text with UTF-8 encoding
    reader.readAsText(blob, 'UTF-8');
  });
}

/**
 * Read file on mobile platform using expo-file-system
 */
async function readMobileFile(uri: string, fileName: string): Promise<WebFileResult> {
  try {
    console.log('📱 Reading mobile file:', uri);
    
    // Dynamic import to avoid web bundling issues
    const FileSystem = await import('expo-file-system');
    
    let content: string;
    let fileInfo: any;
    
    try {
      // Get file info
      fileInfo = await FileSystem.getInfoAsync(uri);
      console.log('📱 File info:', fileInfo);
      
      // Try UTF-8 first
      content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (encodingError) {
      console.warn('📱 UTF-8 encoding failed, trying base64:', encodingError);
      
      // Fallback to base64 and decode
      const base64Content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      content = atob(base64Content);
    }
    
    console.log('📱 Mobile file read successfully:', {
      fileName,
      size: fileInfo?.size || content.length,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...'
    });
    
    return {
      content,
      fileName,
      size: fileInfo?.size || content.length
    };
  } catch (error) {
    console.error('📱 Mobile file read error:', error);
    throw new Error(`Failed to read file on mobile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a URI is a web blob URL
 */
export function isWebBlobUrl(uri: string): boolean {
  return uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http');
}

/**
 * Get file extension from filename or URI
 */
export function getFileExtension(fileName: string): string {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension || '';
}

/**
 * Validate file type for supported formats
 */
export function isSupportedFileType(fileName: string): boolean {
  const extension = getFileExtension(fileName);
  const supportedExtensions = ['txt', 'epub', 'pdf'];
  return supportedExtensions.includes(extension);
}

/**
 * Create a web-safe filename
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path separators and invalid characters
  return fileName.replace(/[/\\:*?"<>|]/g, '_').trim();
}