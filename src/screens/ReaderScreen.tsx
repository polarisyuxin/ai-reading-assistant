import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
  PanResponder,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import AIAssistant from '../components/AIAssistant';
import { detectPrimaryLanguage, countWords } from '../utils/textUtils';
import { calculateWordsPerMinute } from '../utils/timeUtils';

export default function ReaderScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useAppContext();
  const { currentBook, settings, isPlaying } = state;
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [, setSleepTimer] = useState<number | null>(null);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [cachedWordCount, setCachedWordCount] = useState<number>(0);
  const flatListRef = useRef<FlatList>(null);
  const [lastBookId, setLastBookId] = useState<string | null>(null);
  const [, setRenderKey] = useState(0);
  
  // Track scroll position for UI purposes only
  const [currentScrollY, setCurrentScrollY] = useState(0);
  const [estimatedItemHeight, setEstimatedItemHeight] = useState(100); // Dynamic height estimation
  
  // Independent reading progress tracking (0-1, where 1 is completed)
  const [readingProgress, setReadingProgress] = useState(0);
  
  // TTS progress tracking
  const ttsStartTimeRef = useRef<number | null>(null);
  const ttsStartProgressRef = useRef<number>(0);
  const ttsProgressRef = useRef<NodeJS.Timeout | null>(null);
  const lastTtsProgressRef = useRef<number>(0);
  
  // Word-level tracking for TTS highlighting
  const [currentTTSWordPosition, setCurrentTTSWordPosition] = useState<number>(-1);
  const ttsStartCharIndexRef = useRef<number>(0);
  const ttsTextRef = useRef<string>('');
  const ttsWordTrackingRef = useRef<NodeJS.Timeout | null>(null);
  const lastWordBoundaryRef = useRef<number>(0);
  const ttsWordsArrayRef = useRef<Array<{start: number, end: number, word: string}>>([]);
  
  // Loading and content state
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [visibleChunks, setVisibleChunks] = useState<ChunkItem[]>([]); // Only chunks needed for current viewport
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0); // Index of chunk containing current TTS word
  const [viewportChunkRange, setViewportChunkRange] = useState({ start: 0, end: 0 }); // Range of chunks currently in viewport
  
  const [progressBarWidth, setProgressBarWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0); // Track drag position as percentage (0-1)
  const [isScrollingToPosition, setIsScrollingToPosition] = useState(false); // Track if we're animating scroll from progress bar drag
  const [isAutoScrolling, setIsAutoScrolling] = useState(false); // Track if we're auto-scrolling during TTS
  const [showAutoScrollButton, setShowAutoScrollButton] = useState(false); // Show/hide auto-scroll button
  const [viewportTop, setViewportTop] = useState(0); // Track viewport top position
  const [viewportHeight, setViewportHeight] = useState(0); // Track viewport height
  const [actualChunkHeights, setActualChunkHeights] = useState<number[]>([]); // Track actual rendered chunk heights
  const [, setTempPage] = useState(currentBook?.currentPage || 1);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track content size for scroll-based progress
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    return () => {
      Speech.stop();
      stopTtsProgressTracking();
      stopHybridWordTracking();
      setCurrentTTSWordPosition(-1);
    };
  }, []);

  // Track book changes without auto-rendering
  useEffect(() => {
    if (currentBook && currentBook.id !== lastBookId) {
      setLastBookId(currentBook.id);
      console.log('📚 New book selected');
    }
  }, [currentBook?.id, currentBook, lastBookId]);

  // Debug settings changes and force re-render on iOS
  useEffect(() => {
    console.log('🎨 Settings changed in Reader:', {
      fontSize: settings.fontSize,
      textColor: settings.textColor,
      backgroundColor: settings.backgroundColor
    });
    
    // Force re-render on iOS when font size changes
    if (Platform.OS === 'ios') {
      setRenderKey(prev => prev + 1);
    }
  }, [settings.fontSize, settings.textColor, settings.backgroundColor]);

  // Force re-render when current book changes (including repagination)
  useEffect(() => {
    if (currentBook) {
      console.log('📖 Current book updated:', {
        title: currentBook.title,
        currentPage: currentBook.currentPage,
        totalPages: currentBook.totalPages,
        pagesLength: currentBook.pages?.length
      });
      setTempPage(currentBook.currentPage);
      
      // Initialize reading progress based on character position (character-based positioning)
      if (currentBook.totalLength > 0 && currentBook.currentPosition >= 0) {
        const progress = currentBook.currentPosition / currentBook.totalLength;
        const clampedProgress = Math.max(0, Math.min(1, progress));
        setReadingProgress(clampedProgress);
        
        console.log('📚 BOOK CHANGED - INITIALIZING CHARACTER-BASED PROGRESS:', {
          book: {
            title: currentBook.title,
            currentPosition: currentBook.currentPosition,
            totalLength: currentBook.totalLength,
            currentPage: currentBook.currentPage,
            totalPages: currentBook.totalPages
          },
          progressBar: {
            characterBasedPercentage: (progress * 100).toFixed(2) + '%',
            clampedPercentage: (clampedProgress * 100).toFixed(2) + '%'
          },
          readingPosition: {
            characterIndex: currentBook.currentPosition,
            estimatedWordsRead: Math.floor(clampedProgress * cachedWordCount),
            totalCharacters: currentBook.totalLength,
            totalWords: cachedWordCount
          }
        });
      }
    }
  }, [currentBook?.totalPages, currentBook?.currentPage, currentBook]);

  // OPTIMIZED: Stable word count function that doesn't trigger re-renders
  const getCachedWordCount = useCallback(() => {
    if (!currentBook?.content) return 0;
    
    // Return current cached value if available
    if (cachedWordCount > 0) {
      return cachedWordCount;
    }
    
    // If we need to calculate, return 0 and let the effect handle it
    // This prevents infinite loops from state updates during render
    return 0;
  }, [currentBook?.content, cachedWordCount]);

  // Calculate word count when book changes
  useEffect(() => {
    if (currentBook && currentBook.id !== lastBookId) {
      console.log('📚 Book changed - calculating word count');
      setLastBookId(currentBook.id);
      
      if (currentBook.content) {
        // Calculate asynchronously to prevent blocking
        setTimeout(() => {
          console.log('📊 Calculating word count for:', currentBook.title);
          const startTime = Date.now();
          const wordStats = countWords(currentBook.content);
          const wordCount = wordStats.words || 0;
          setCachedWordCount(wordCount);
          const endTime = Date.now();
          console.log(`📊 Word count calculated: ${wordCount} words in ${endTime - startTime}ms`);
        }, 0);
      } else {
        setCachedWordCount(0);
      }
    } else if (!currentBook?.content) {
      setCachedWordCount(0);
    }
  }, [currentBook?.id, currentBook?.content, currentBook?.title, lastBookId]);

  const startReading = async () => {
    console.log('🚀 OPTIMIZED TTS START - Fast loading strategy');
    
    if (!currentBook || !currentBook.content) {
      Alert.alert('Error', 'No content available to read');
      return;
    }

    const fullContent = currentBook.content;
    const startCharIndex = Math.floor(readingProgress * fullContent.length);
    
    // OPTIMIZATION: Use chunked loading strategy for large books
    const INITIAL_CHUNK_SIZE = 10000; // Start with ~10KB of text for immediate playback
    const remainingLength = fullContent.length - startCharIndex;
    
    let textToRead: string;
    let isPartialLoad = false;
    
    if (remainingLength > INITIAL_CHUNK_SIZE) {
      // For large content, start with a chunk and queue more
      const initialEndIndex = startCharIndex + INITIAL_CHUNK_SIZE;
      
      // Find a good break point (end of sentence/paragraph)
      let breakIndex = initialEndIndex;
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n'];
      
      for (const breakPoint of breakPoints) {
        const foundBreak = fullContent.indexOf(breakPoint, initialEndIndex);
        if (foundBreak > initialEndIndex && foundBreak < initialEndIndex + 1000) {
          breakIndex = foundBreak + breakPoint.length;
          break;
        }
      }
      
      textToRead = fullContent.substring(startCharIndex, breakIndex);
      isPartialLoad = true;
      
      console.log('📦 CHUNKED LOADING:', {
        totalRemaining: remainingLength,
        chunkSize: textToRead.length,
        isPartial: isPartialLoad,
        hasMoreContent: true
      });
    } else {
      // Small content, load all remaining
      textToRead = fullContent.substring(startCharIndex);
      isPartialLoad = false;
      
      console.log('📦 FULL LOADING:', {
        remainingLength,
        loadedAll: true
      });
    }
    
    if (!textToRead.trim()) {
      Alert.alert('Info', 'You have already completed reading this book');
      return;
    }
    
    console.log('🎯 TTS starting from progress:', {
      readingProgress: readingProgress,
      startCharIndex: startCharIndex,
      remainingLength: textToRead.length,
      totalLength: fullContent.length,
      textPreview: textToRead.substring(0, 100) + '...'
    });
    
    // Auto-detect language for better TTS if not manually set
    const detectedLanguage = detectPrimaryLanguage(textToRead);
    let ttsLanguage = settings.speechLanguage;
    
    // Auto-switch to Chinese TTS for Chinese text if currently set to English
    if (detectedLanguage === 'chinese' && settings.speechLanguage === 'en-US') {
      ttsLanguage = 'zh-CN'; // Default to Simplified Chinese
      console.log('🎵 Auto-detected Chinese text, switching TTS to Chinese');
    }
    
    // OPTIMIZATION: Fast word counting for chunked content
    let remainingWordCount: number;
    
    if (isPartialLoad) {
      // For partial loads, estimate remaining words based on chunk + total ratio
      const chunkWordCount = textToRead.split(/\s+/).filter(word => word.length > 0).length;
      const totalRemainingChars = remainingLength;
      const chunkChars = textToRead.length;
      const estimatedTotalWords = Math.round((chunkWordCount * totalRemainingChars) / chunkChars);
      
      remainingWordCount = estimatedTotalWords;
      
      console.log('⚡ FAST WORD COUNT (estimated):', {
        chunkWords: chunkWordCount,
        estimatedTotal: estimatedTotalWords,
        method: 'ratio-based estimation'
      });
    } else {
      // For full loads on small content, do precise counting
      const remainingWordStats = countWords(textToRead);
      remainingWordCount = remainingWordStats.words || 0;
      
      console.log('⚡ PRECISE WORD COUNT:', {
        actualCount: remainingWordCount,
        method: 'full analysis'
      });
    }
    
    // Safety check for minimum content
    if (remainingWordCount < 5) {
      Alert.alert('Info', 'Very little content remaining to read. You may be near the end of the book.');
      console.warn('⚠️ TTS: Very few words remaining:', remainingWordCount);
    }
    
    console.log('🔊 Starting TTS with language:', ttsLanguage, 'for text:', textToRead.substring(0, 50) + '...');
    // Get total word count lazily (only when needed for TTS)
    const totalWordCount = getCachedWordCount();
    
    console.log('📊 TTS word count:', {
      remainingWords: remainingWordCount,
      totalWords: totalWordCount,
      progressStart: readingProgress,
      percentageComplete: (readingProgress * 100).toFixed(1) + '%',
      textLength: textToRead.length
    });
    
    dispatch({ type: 'SET_PLAYING', payload: true });
    
    // Start TTS progress tracking with remaining word count
    console.log('🎬 Starting TTS playback and progress tracking');
    console.log('📍 READING POSITION vs PROGRESS LOCATION:', {
      readingPosition: {
        startCharacterIndex: startCharIndex,
        totalCharacters: fullContent.length,
        remainingCharacters: textToRead.length,
        percentageIntoBook: ((startCharIndex / fullContent.length) * 100).toFixed(2) + '%'
      },
      progressLocation: {
        progressBarPercentage: (readingProgress * 100).toFixed(2) + '%',
        currentPage: currentBook.currentPage,
        totalPages: currentBook.totalPages
      },
      ttsContent: {
        remainingWords: remainingWordCount,
        totalWords: cachedWordCount,
        textPreview: textToRead.substring(0, 100) + '...'
      }
    });
    
    // Store TTS text and starting position for word boundary tracking
    ttsStartCharIndexRef.current = startCharIndex;
    ttsTextRef.current = textToRead;
    setCurrentTTSWordPosition(-1); // Reset word position
    
    // OPTIMIZATION: Only analyze words for the initial chunk for fast startup
    analyzeWordsInTextOptimized(textToRead, isPartialLoad);
    
    startTtsProgressTracking(remainingWordCount);
    startHybridWordTracking();
    logCompleteState('TTS STARTED');

    Speech.speak(textToRead, {
      rate: settings.speechRate,
      voice: settings.speechVoice,
      language: ttsLanguage,
      onBoundary: (boundary: any) => {
        // This callback fires when TTS reaches each word boundary
        if (boundary && typeof boundary.charIndex === 'number') {
          const absoluteCharPosition = ttsStartCharIndexRef.current + boundary.charIndex;
          
          // Find which word index this boundary corresponds to
          const wordIndex = ttsWordsArrayRef.current.findIndex(word => 
            word.start <= absoluteCharPosition && absoluteCharPosition < word.end
          );
          
          if (wordIndex >= 0) {
            // Update the boundary reference for hybrid tracking
            lastWordBoundaryRef.current = Math.max(lastWordBoundaryRef.current, wordIndex);
            const previousPosition = currentTTSWordPosition;
            setCurrentTTSWordPosition(absoluteCharPosition);
            
            // Auto-scroll is disabled - only scroll when user clicks the button
            // if (Math.abs(absoluteCharPosition - previousPosition) > 50) {
            //   setTimeout(() => {
            //     autoScrollToCurrentWord();
            //   }, 10);
            // }
            
            console.log('🎯 TTS Word Boundary:', {
              wordIndex: wordIndex,
              relativeCharIndex: boundary.charIndex,
              absoluteCharPosition: absoluteCharPosition,
              currentWord: ttsWordsArrayRef.current[wordIndex]?.word || 'unknown',
              previousPosition: previousPosition,
              shouldScroll: Math.abs(absoluteCharPosition - previousPosition) > 50
            });
          }
        }
      },
      onDone: () => {
        console.log('🎵 TTS finished reading remaining content - preserving current progress');
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        stopHybridWordTracking();
        setCurrentTTSWordPosition(-1); // Clear word highlighting
        // NEVER change progress on TTS completion - it stays wherever TTS finished reading
      },
      onStopped: () => {
        console.log('🎵 TTS manually stopped - preserving current progress');
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        stopHybridWordTracking();
        setCurrentTTSWordPosition(-1); // Clear word highlighting
        // NEVER change progress on manual stop - it stays wherever TTS was paused
      },
      onError: (error) => {
        console.error('TTS Error:', error);
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        stopHybridWordTracking();
        setCurrentTTSWordPosition(-1); // Clear word highlighting
        Alert.alert('Speech Error', 'Text-to-speech failed. Try adjusting the language setting.');
      },
    });
  };

  const stopReading = () => {
    console.log('⏸️ Stopping TTS - current progress:', (readingProgress * 100).toFixed(2) + '%');
    
    // Stop TTS tracking FIRST to prevent any final calculations
    stopTtsProgressTracking();
    stopHybridWordTracking();
    setCurrentTTSWordPosition(-1); // Clear word highlighting
    
    // Then stop the speech
    Speech.stop();
    dispatch({ type: 'SET_PLAYING', payload: false });
    
    console.log('⏸️ TTS stopped - final progress:', (readingProgress * 100).toFixed(2) + '%');
    logCompleteState('TTS PAUSED/STOPPED');
  };

  const handleTextSelection = (text: string) => {
    setSelectedText(text);
    setShowAIModal(true);
  };

  const addBookmark = () => {
    if (!currentBook) return;

    const bookmark = {
      id: Date.now().toString(),
      position: currentBook.currentPosition,
      dateCreated: new Date(),
    };

    dispatch({
      type: 'ADD_BOOKMARK',
      payload: { bookId: currentBook.id, bookmark },
    });

    Alert.alert('Bookmark Added', 'Your current position has been bookmarked.');
  };

  const renderFirstPage = () => {
    if (!currentBook || !currentBook.pages || currentBook.pages.length === 0) {
      console.log('📄 No pages available to render');
      return;
    }

    const firstPage = currentBook.pages[0];
    console.log('📄 FIRST PAGE RENDER:');
    console.log('📖 Book:', currentBook.title);
    console.log('📄 Page Number:', firstPage.pageNumber);
    console.log('📝 Content Length:', firstPage.content.length);
    console.log('📋 Content Preview (first 200 chars):', firstPage.content.substring(0, 200) + '...');
    console.log('📄 Full First Page Content:');
    console.log('━'.repeat(50));
    console.log(firstPage.content);
    console.log('━'.repeat(50));
    
    Alert.alert(
      'First Page Rendered',
      `First page content logged to console.\n\nPage: ${firstPage.pageNumber}\nLength: ${firstPage.content.length} characters\n\nCheck your development console for the full content.`
    );
  };

  const getCurrentPage = () => {
    if (!currentBook || !currentBook.pages || currentBook.pages.length === 0) {
      console.log('getCurrentPage: No book or pages available');
      return null;
    }
    
    console.log('getCurrentPage: Looking for page', currentBook.currentPage, 'in', currentBook.pages.length, 'pages');
    const page = currentBook.pages.find(page => page.pageNumber === currentBook.currentPage) || currentBook.pages[0];
    console.log('getCurrentPage: Found page:', page?.pageNumber, 'content length:', page?.content.length);
    
    return page;
  };

  // Content loading constants
  const SMALL_CHUNK_SIZE = 500; // Much smaller chunks for precise positioning
  const VIEWPORT_BUFFER = 3; // Number of chunks to load before/after current position
  
  // Define chunk item type
  interface ChunkItem {
    id: string;
    text: string;
    startIndex: number;
    endIndex: number;
  }
  
  // Create smaller, more manageable chunks
  const createSmallChunks = (content: string): ChunkItem[] => {
    const chunks: ChunkItem[] = [];
    
    for (let i = 0; i < content.length; i += SMALL_CHUNK_SIZE) {
      let endIndex = Math.min(i + SMALL_CHUNK_SIZE, content.length);
      
      // Find natural break points for better readability
      if (endIndex < content.length) {
        const searchEnd = Math.min(endIndex + 100, content.length);
        const naturalBreaks = ['. ', '! ', '? ', '\n'];
        
        for (const breakPoint of naturalBreaks) {
          const breakIndex = content.lastIndexOf(breakPoint, searchEnd);
          if (breakIndex > endIndex - 50 && breakIndex < searchEnd) {
            endIndex = breakIndex + breakPoint.length;
            break;
          }
        }
      }
      
      chunks.push({
        id: `chunk-${chunks.length}`,
        text: content.substring(i, endIndex),
        startIndex: i,
        endIndex: endIndex
      });
      
      i = endIndex - SMALL_CHUNK_SIZE;
    }
    
    return chunks;
  };

  // Get chunks around the current TTS position for efficient loading
  const getVisibleChunksAroundPosition = (allChunks: ChunkItem[], ttsPosition: number): { chunks: ChunkItem[], currentIndex: number } => {
    if (!allChunks.length) return { chunks: [], currentIndex: 0 };
    
    // Find chunk containing current TTS position
    const currentIndex = allChunks.findIndex(chunk => 
      ttsPosition >= chunk.startIndex && ttsPosition < chunk.endIndex
    );
    
    if (currentIndex === -1) {
      // Fallback to first few chunks if position not found
      return {
        chunks: allChunks.slice(0, Math.min(VIEWPORT_BUFFER * 2 + 1, allChunks.length)),
        currentIndex: 0
      };
    }
    
    // Load current chunk plus buffer before and after
    const startIndex = Math.max(0, currentIndex - VIEWPORT_BUFFER);
    const endIndex = Math.min(allChunks.length, currentIndex + VIEWPORT_BUFFER + 1);
    
    const visibleChunks = allChunks.slice(startIndex, endIndex);
    const adjustedCurrentIndex = currentIndex - startIndex;
    
    console.log(`📱 Loading ${visibleChunks.length} chunks around position ${ttsPosition}:`, {
      totalChunks: allChunks.length,
      currentChunkIndex: currentIndex,
      visibleRange: `${startIndex}-${endIndex-1}`,
      adjustedCurrentIndex
    });
    
    return {
      chunks: visibleChunks,
      currentIndex: adjustedCurrentIndex
    };
  };
  
  // Store all chunks for the book (created once)
  const [allBookChunks, setAllBookChunks] = useState<ChunkItem[]>([]);

  // Create chunks when book changes
  useEffect(() => {
    if (currentBook?.content && currentBook.id !== lastBookId) {
      console.log('🚀 Creating small chunks for efficient loading');
      setIsContentLoading(true);
      
      const chunks = createSmallChunks(currentBook.content);
      setAllBookChunks(chunks);
      
      // Load initial visible chunks around current position
      const initialPosition = Math.floor(readingProgress * currentBook.content.length);
      const { chunks: initialVisible, currentIndex } = getVisibleChunksAroundPosition(chunks, initialPosition);
      
      setVisibleChunks(initialVisible);
      setCurrentChunkIndex(currentIndex);
      setIsContentLoading(false);
      
      console.log(`✅ Created ${chunks.length} small chunks, loaded ${initialVisible.length} initially`);
    } else if (!currentBook?.content) {
      setAllBookChunks([]);
      setVisibleChunks([]);
      setCurrentChunkIndex(0);
      setIsContentLoading(false);
    }
  }, [currentBook?.content, currentBook?.id, lastBookId, readingProgress]);

  // Update visible chunks when TTS position changes significantly
  useEffect(() => {
    if (isPlaying && currentTTSWordPosition >= 0 && allBookChunks.length > 0) {
      // Find which chunk in all chunks contains the TTS position
      const globalChunkIndex = allBookChunks.findIndex(chunk => 
        currentTTSWordPosition >= chunk.startIndex && currentTTSWordPosition < chunk.endIndex
      );
      
      if (globalChunkIndex === -1) return;
      
      // Check if this chunk is already in our visible range
      const chunkInVisible = visibleChunks.findIndex(chunk => chunk.id === allBookChunks[globalChunkIndex].id);
      
      if (chunkInVisible === -1) {
        // TTS moved to a chunk not currently loaded - load chunks around it
        const { chunks, currentIndex } = getVisibleChunksAroundPosition(allBookChunks, currentTTSWordPosition);
        
        setVisibleChunks(chunks);
        setCurrentChunkIndex(currentIndex);
        
        console.log('🔄 TTS moved to new area - loaded chunks:', {
          ttsPosition: currentTTSWordPosition,
          globalChunkIndex,
          newCurrentIndex: currentIndex,
          visibleChunksCount: chunks.length
        });
      } else {
        // Update current index to point to the correct chunk in visible range
        if (chunkInVisible !== currentChunkIndex) {
          setCurrentChunkIndex(chunkInVisible);
          
          console.log('🔄 Updated current chunk index in visible range:', {
            oldIndex: currentChunkIndex,
            newIndex: chunkInVisible,
            chunkId: visibleChunks[chunkInVisible]?.id
          });
        }
      }
    }
  }, [currentTTSWordPosition, isPlaying, allBookChunks, currentChunkIndex, visibleChunks]);
  
  // iOS-specific text styling
  const getTextStyle = () => Platform.select({
    ios: {
      color: settings.textColor, 
      fontSize: settings.fontSize,
      lineHeight: Platform.OS === 'ios' ? settings.fontSize * 1.6 : settings.fontSize * 1.75,
      fontFamily: Platform.OS === 'ios' ? 'System' : undefined,
    },
    default: {
      color: settings.textColor, 
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * 1.75,
    }
  });
  
  // Helper function to get the current word position within a chunk
  const getCurrentWordInChunk = (item: ChunkItem): { wordStart: number; wordEnd: number } | null => {
    if (!isPlaying || currentTTSWordPosition < 0) return null;
    
    // Check if current TTS position is within this chunk
    if (currentTTSWordPosition >= item.startIndex && currentTTSWordPosition < item.endIndex) {
      const relativePosition = currentTTSWordPosition - item.startIndex;
      
      // Find word boundaries around the current position
      let wordStart = relativePosition;
      let wordEnd = relativePosition;
      
      // Find start of current word (go backward until we hit whitespace or start of text)
      while (wordStart > 0 && !/\s/.test(item.text[wordStart - 1])) {
        wordStart--;
      }
      
      // Find end of current word (go forward until we hit whitespace or end of text)
      while (wordEnd < item.text.length && !/\s/.test(item.text[wordEnd])) {
        wordEnd++;
      }
      
      return { wordStart, wordEnd };
    }
    
    return null; // Current position is not in this chunk
  };

  // Auto-scroll to center the currently spoken word in the middle of viewport
  const autoScrollToCurrentWord = useCallback((forceScroll = false) => {
    if ((!isPlaying && !forceScroll) || currentTTSWordPosition < 0 || !flatListRef.current || !currentBook?.content) {
      console.log('🚫 Auto-scroll skipped:', {
        isPlaying,
        forceScroll,
        currentTTSWordPosition,
        hasFlatListRef: !!flatListRef.current,
        hasContent: !!currentBook?.content
      });
      return;
    }

    // Find the chunk containing current TTS word in visible chunks
    const visibleChunkIndex = visibleChunks.findIndex(chunk => 
      currentTTSWordPosition >= chunk.startIndex && currentTTSWordPosition < chunk.endIndex
    );
    
    if (visibleChunkIndex >= 0) {
      setIsAutoScrolling(true);
      
      console.log('🎯 Auto-scrolling to center current TTS chunk:', {
        visibleChunkIndex,
        currentTTSWordPosition,
        chunkRange: `${visibleChunks[visibleChunkIndex].startIndex}-${visibleChunks[visibleChunkIndex].endIndex}`,
        visibleChunksCount: visibleChunks.length,
        chunkId: visibleChunks[visibleChunkIndex].id,
        forceScroll,
        method: 'FlatList.scrollToIndex with recalculated index'
      });
      
      // Center the chunk containing the current word using the correct FlatList index
      flatListRef.current.scrollToIndex({
        index: visibleChunkIndex, // Use the index in visible chunks array
        viewPosition: 0.5, // Center the chunk in viewport
        animated: true,
      });
      
      // Hide auto-scroll button temporarily after manual scroll
      if (forceScroll) {
        setShowAutoScrollButton(false);
        setTimeout(() => {
          setShowAutoScrollButton(isPlaying);
        }, 2000);
      }
      
      // Reset auto-scrolling flag after animation
      setTimeout(() => {
        setIsAutoScrolling(false);
      }, 500);
    } else {
      console.log('🚫 Current TTS word not in visible chunks - reloading around position:', {
        currentTTSWordPosition,
        visibleChunksCount: visibleChunks.length,
        allChunksCount: allBookChunks.length,
        visibleRange: visibleChunks.length > 0 ? `${visibleChunks[0].startIndex}-${visibleChunks[visibleChunks.length-1].endIndex}` : 'empty'
      });
      
      // Force update visible chunks around current TTS position
      if (allBookChunks.length > 0) {
        const { chunks, currentIndex } = getVisibleChunksAroundPosition(allBookChunks, currentTTSWordPosition);
        setVisibleChunks(chunks);
        setCurrentChunkIndex(currentIndex);
        
        // After loading, try auto-scroll again with a slight delay
        setTimeout(() => {
          if (forceScroll) {
            autoScrollToCurrentWord(true);
          }
        }, 100);
      }
    }
  }, [isPlaying, currentTTSWordPosition, visibleChunks, estimatedItemHeight, containerHeight, currentBook?.content]);

  // Auto-scroll is disabled - only scroll when user clicks the button
  // useEffect(() => {
  //   if (isPlaying && currentTTSWordPosition >= 0) {
  //     const timeoutId = setTimeout(() => {
  //       autoScrollToCurrentWord();
  //     }, 200);
  //     
  //     return () => clearTimeout(timeoutId);
  //   }
  // }, [currentTTSWordPosition, isPlaying, autoScrollToCurrentWord]);

  // Show auto-scroll button when TTS is playing
  useEffect(() => {
    setShowAutoScrollButton(isPlaying);
  }, [isPlaying]);

  // Handle scroll events, track viewport position, and load chunks as needed
  const handleScrollWithButton = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    const scrollY = contentOffset.y;
    
    // Update viewport position for yellow highlight
    setViewportTop(scrollY);
    
    // Calculate which chunks are currently in viewport
    if (estimatedItemHeight > 0 && allBookChunks.length > 0) {
      const viewportTop = scrollY;
      const viewportBottom = scrollY + containerHeight;
      
      // Calculate chunk indices that are visible
      const startChunkIndex = Math.floor(viewportTop / estimatedItemHeight);
      const endChunkIndex = Math.min(
        Math.ceil(viewportBottom / estimatedItemHeight),
        visibleChunks.length - 1
      );
      
      setViewportChunkRange({ start: startChunkIndex, end: endChunkIndex });
      
      // Check if we need to load more chunks based on scroll position
      const needsMoreChunks = checkAndLoadMoreChunks(startChunkIndex, endChunkIndex);
      
      if (needsMoreChunks) {
        console.log('📜 User scroll triggered chunk loading:', {
          viewportRange: `${startChunkIndex}-${endChunkIndex}`,
          scrollY,
          containerHeight,
          estimatedItemHeight
        });
      }
    }
    
    handleScroll(event);
  };

  // Check if we need to load more chunks based on current viewport
  const checkAndLoadMoreChunks = (viewportStart: number, viewportEnd: number): boolean => {
    if (!allBookChunks.length || !visibleChunks.length) return false;
    
    // Get the absolute chunk indices in the full book
    const firstVisibleChunk = allBookChunks.findIndex(chunk => chunk.id === visibleChunks[0].id);
    const lastVisibleChunk = allBookChunks.findIndex(chunk => chunk.id === visibleChunks[visibleChunks.length - 1].id);
    
    if (firstVisibleChunk === -1 || lastVisibleChunk === -1) return false;
    
    // Check if viewport is getting close to the edges of loaded chunks
    const bufferThreshold = 1; // Load more when within 1 chunk of edge
    
    let needsUpdate = false;
    let newStartIndex = firstVisibleChunk;
    let newEndIndex = lastVisibleChunk;
    
    // Check if we need chunks before current range
    if (viewportStart <= bufferThreshold) {
      newStartIndex = Math.max(0, firstVisibleChunk - VIEWPORT_BUFFER);
      needsUpdate = newStartIndex !== firstVisibleChunk;
    }
    
    // Check if we need chunks after current range
    if (viewportEnd >= visibleChunks.length - bufferThreshold - 1) {
      newEndIndex = Math.min(allBookChunks.length - 1, lastVisibleChunk + VIEWPORT_BUFFER);
      needsUpdate = needsUpdate || newEndIndex !== lastVisibleChunk;
    }
    
    if (needsUpdate) {
      const newVisibleChunks = allBookChunks.slice(newStartIndex, newEndIndex + 1);
      const adjustedCurrentIndex = Math.max(0, currentChunkIndex + (newStartIndex - firstVisibleChunk));
      
      setVisibleChunks(newVisibleChunks);
      setCurrentChunkIndex(adjustedCurrentIndex);
      
      console.log('🔄 Auto-loaded chunks due to scroll:', {
        oldRange: `${firstVisibleChunk}-${lastVisibleChunk}`,
        newRange: `${newStartIndex}-${newEndIndex}`,
        newVisibleCount: newVisibleChunks.length,
        adjustedCurrentIndex
      });
      
      return true;
    }
    
    return false;
  };

  // Function to render text with word-level highlighting
  const renderTextWithWordHighlight = (text: string, wordBoundary: { wordStart: number; wordEnd: number } | null) => {
    if (!wordBoundary) {
      // No highlighting needed, render normal text
      return <Text style={[styles.bookText, getTextStyle()]}>{text}</Text>;
    }

    const beforeHighlight = text.substring(0, wordBoundary.wordStart);
    const highlightedWord = text.substring(wordBoundary.wordStart, wordBoundary.wordEnd);
    const afterHighlight = text.substring(wordBoundary.wordEnd);

    return (
      <Text style={[styles.bookText, getTextStyle()]}>
        {beforeHighlight}
        <Text style={[getTextStyle(), styles.highlightedWord]}>{highlightedWord}</Text>
        {afterHighlight}
      </Text>
    );
  };

  const renderChunk = ({ item, index }: { item: ChunkItem; index: number }) => {
    const currentWordBoundary = getCurrentWordInChunk(item);
    
    return (
      <View style={styles.chunkContainer}>
        <View
          onLayout={(event) => {
            const { height } = event.nativeEvent.layout;
            
            // Update estimated height based on first chunk
            if (index === 0) {
              setEstimatedItemHeight(height);
            }
            
            // Store actual height for each chunk
            setActualChunkHeights(prev => {
              const newHeights = [...prev];
              newHeights[index] = height;
              return newHeights;
            });
          }}
        >
          {renderTextWithWordHighlight(item.text, currentWordBoundary)}
        </View>
      </View>
    );
  };
  

  const renderContent = () => {
    if (!currentBook || !currentBook.content) {
      const noContentStyle = Platform.select({
        ios: {
          color: settings.textColor, 
          fontSize: settings.fontSize,
          lineHeight: settings.fontSize * 1.6,
          fontFamily: 'System',
        },
        default: {
          color: settings.textColor, 
          fontSize: settings.fontSize,
          lineHeight: settings.fontSize * 1.75,
        }
      });
      return (
        <View style={styles.textContent}>
          <Text style={[styles.bookText, noContentStyle]}>
            No content available
          </Text>
        </View>
      );
    }

    // Show empty content only while initially loading (no skeleton UI)
    if (visibleChunks.length === 0 && isContentLoading) {
      return <View style={styles.textContent} />;
    }

    console.log('📱 Rendering efficient content:', {
      visibleChunks: visibleChunks.length,
      totalChunks: allBookChunks.length,
      currentChunkIndex,
      viewportRange: `${viewportChunkRange.start}-${viewportChunkRange.end}`
    });
    
    return (
      <FlatList
        ref={flatListRef}
        data={visibleChunks}
        renderItem={renderChunk}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={10}
        initialNumToRender={3}
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => ({
          length: estimatedItemHeight,
          offset: estimatedItemHeight * index,
          index,
        })}
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={16}
        onScroll={handleScrollWithButton}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEnabled={true} // Allow user scrolling at all times
        onContentSizeChange={(width, height) => setContentHeight(height)}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setContainerHeight(height);
          setViewportHeight(height); // Track viewport height for yellow highlight
        }}
        contentContainerStyle={styles.textContent}
      />
    );
  };

  const goToLibrary = () => {
    navigation.navigate('Library' as never);
  };

  const goToChapter = (chapterStartPage: number) => {
    if (!currentBook) return;
    
    // Find the chapter by startPage
    const selectedChapter = currentBook.chapters.find(chapter => chapter.startPage === chapterStartPage);
    if (!selectedChapter) {
      console.warn('Chapter not found for page:', chapterStartPage);
      return;
    }
    
    dispatch({
      type: 'UPDATE_CURRENT_PAGE',
      payload: { bookId: currentBook.id, page: chapterStartPage },
    });
    
    // DIRECT POSITION SET: Jump immediately to chapter position using character-based positioning
    if (currentBook.totalLength > 0 && selectedChapter.startPosition >= 0) {
      const progress = Math.max(0, Math.min(1, selectedChapter.startPosition / currentBook.totalLength));
      setReadingProgress(progress);
      lastTtsProgressRef.current = progress; // Update ref to match - no interpolation
      
      // Update current position in the book to match chapter start
      dispatch({
        type: 'UPDATE_READING_POSITION',
        payload: { bookId: currentBook.id, position: selectedChapter.startPosition }
      });
      
      console.log('📖 CHAPTER NAVIGATION: DIRECT POSITION SET (CHARACTER-BASED):', {
        action: 'User selected chapter',
        chapterTitle: selectedChapter.title,
        chapterStartPosition: selectedChapter.startPosition,
        chapterStartPage: chapterStartPage,
        selectedPosition: (progress * 100).toFixed(2) + '%',
        behavior: 'Jump directly - no interpolation'
      });
    }
    
    setShowChapterModal(false);
  };
  
  // Function to advance reading progress (manual controls only - stops TTS first) - CHARACTER-BASED
  const advanceReadingProgress = (progressIncrement: number) => {
    if (!currentBook) return;
    
    console.log('📍 SKIP BUTTON: DIRECT POSITION SET (CHARACTER-BASED):', {
      action: progressIncrement > 0 ? 'Skip forward button' : 'Skip backward button',
      increment: (progressIncrement * 100).toFixed(2) + '%',
      fromPosition: (readingProgress * 100).toFixed(2) + '%',
      toPosition: ((readingProgress + progressIncrement) * 100).toFixed(2) + '%',
      behavior: 'Jump directly - no interpolation',
      wasTtsActive: !!ttsProgressRef.current
    });
    
    // Manual progress change should stop TTS and take control
    if (ttsProgressRef.current) {
      console.log('🛑 Manual control - stopping TTS first');
      stopTtsProgressTracking();
    }
    
    // DIRECT POSITION SET: Jump immediately to calculated position using character-based positioning
    const newProgress = Math.max(0, Math.min(1, readingProgress + progressIncrement));
    const newCharacterPosition = Math.floor(newProgress * currentBook.totalLength);
    
    setReadingProgress(newProgress);
    lastTtsProgressRef.current = newProgress; // Update ref to match - no interpolation
    
    // Update current position in the book to match the new progress
    dispatch({
      type: 'UPDATE_READING_POSITION',
      payload: { bookId: currentBook.id, position: newCharacterPosition }
    });
    
    logCompleteState('MANUAL CONTROL COMPLETED');
    
    // Update current page based on new character position
    if (currentBook.pages && currentBook.pages.length > 0) {
      const targetPage = currentBook.pages.find(page => 
        newCharacterPosition >= page.startPosition && newCharacterPosition <= page.endPosition
      );
      if (targetPage) {
        dispatch({
          type: 'UPDATE_CURRENT_PAGE',
          payload: { bookId: currentBook.id, page: targetPage.pageNumber },
        });
      }
    }
  };
  
  // Function to set reading progress to a specific value
  const setReadingProgressToPage = (page: number) => {
    if (!currentBook || currentBook.totalPages === 0) return;
    
    const progress = (page - 1) / currentBook.totalPages;
    setReadingProgress(Math.max(0, Math.min(1, progress)));
    
    dispatch({
      type: 'UPDATE_CURRENT_PAGE',
      payload: { bookId: currentBook.id, page },
    });
  };

  // OPTIMIZED: Fast word analysis for immediate TTS startup
  const analyzeWordsInTextOptimized = (text: string, isPartialLoad: boolean) => {
    const startTime = Date.now();
    
    if (isPartialLoad) {
      // For partial loads, only analyze first portion for immediate tracking
      const ANALYSIS_LIMIT = 2000; // Analyze first ~2KB for immediate word tracking
      const analysisText = text.substring(0, Math.min(ANALYSIS_LIMIT, text.length));
      
      const words: Array<{start: number, end: number, word: string}> = [];
      const wordPattern = /\S+/g;
      let match;
      
      while ((match = wordPattern.exec(analysisText)) !== null) {
        words.push({
          start: ttsStartCharIndexRef.current + match.index,
          end: ttsStartCharIndexRef.current + match.index + match[0].length,
          word: match[0]
        });
      }
      
      ttsWordsArrayRef.current = words;
      lastWordBoundaryRef.current = 0;
      
      const endTime = Date.now();
      console.log('⚡ FAST WORD ANALYSIS (partial):', {
        analyzedWords: words.length,
        analyzedChars: analysisText.length,
        totalChars: text.length,
        analysisTime: endTime - startTime + 'ms',
        firstWords: words.slice(0, 3).map(w => w.word)
      });
      
      // TODO: Could implement background analysis of remaining words if needed
      
    } else {
      // For small/full content, do complete analysis
      const words: Array<{start: number, end: number, word: string}> = [];
      const wordPattern = /\S+/g;
      let match;
      
      while ((match = wordPattern.exec(text)) !== null) {
        words.push({
          start: ttsStartCharIndexRef.current + match.index,
          end: ttsStartCharIndexRef.current + match.index + match[0].length,
          word: match[0]
        });
      }
      
      ttsWordsArrayRef.current = words;
      lastWordBoundaryRef.current = 0;
      
      const endTime = Date.now();
      console.log('📝 COMPLETE WORD ANALYSIS:', {
        totalWords: words.length,
        analysisTime: endTime - startTime + 'ms',
        firstWords: words.slice(0, 3).map(w => w.word)
      });
    }
  };

  // Hybrid word tracking that combines onBoundary with time-based fallback
  const startHybridWordTracking = () => {
    if (!currentBook || ttsWordsArrayRef.current.length === 0) return;
    
    // Clear any existing tracking
    if (ttsWordTrackingRef.current) {
      clearInterval(ttsWordTrackingRef.current);
    }
    
    const speechRate = settings.speechRate;
    const currentWpm = calculateWordsPerMinute(speechRate);
    const wordsPerSecond = currentWpm / 60;
    
    console.log('🎯 Starting hybrid word tracking:', {
      totalWords: ttsWordsArrayRef.current.length,
      wordsPerSecond: wordsPerSecond.toFixed(2),
      speechRate: speechRate
    });
    
    // Update word position every 100ms for smooth progression
    ttsWordTrackingRef.current = setInterval(() => {
      if (!ttsStartTimeRef.current) return;
      
      const elapsedSeconds = (Date.now() - ttsStartTimeRef.current) / 1000;
      const estimatedWordsRead = Math.floor(elapsedSeconds * wordsPerSecond);
      
      // Use the boundary-based position if available, otherwise use time-based estimation
      const targetWordIndex = Math.min(
        Math.max(lastWordBoundaryRef.current, estimatedWordsRead),
        ttsWordsArrayRef.current.length - 1
      );
      
      if (targetWordIndex >= 0 && targetWordIndex < ttsWordsArrayRef.current.length) {
        const currentWord = ttsWordsArrayRef.current[targetWordIndex];
        const newWordPosition = currentWord.start;
        
        // Update word position
        setCurrentTTSWordPosition(newWordPosition);
        
        // Debug logging every 2 seconds
        if (Math.floor(elapsedSeconds) % 2 === 0 && Math.floor(elapsedSeconds * 10) % 20 === 0) {
          console.log('📍 Hybrid word tracking:', {
            wordIndex: targetWordIndex,
            currentWord: currentWord.word,
            boundaryIndex: lastWordBoundaryRef.current,
            estimatedIndex: estimatedWordsRead,
            elapsedSeconds: elapsedSeconds.toFixed(1),
            wordPosition: newWordPosition
          });
        }
      }
    }, 100);
  };

  // Stop hybrid word tracking
  const stopHybridWordTracking = () => {
    if (ttsWordTrackingRef.current) {
      clearInterval(ttsWordTrackingRef.current);
      ttsWordTrackingRef.current = null;
    }
    ttsWordsArrayRef.current = [];
    lastWordBoundaryRef.current = 0;
    console.log('🛑 Hybrid word tracking stopped');
  };
  
  // Start TTS progress tracking
  const startTtsProgressTracking = (remainingWordCount: number) => {
    if (!currentBook || cachedWordCount === 0) return;
    
    // Record when TTS started and from what progress point (user-selected or current)
    ttsStartTimeRef.current = Date.now();
    ttsStartProgressRef.current = readingProgress; // Use EXACT current position
    lastTtsProgressRef.current = readingProgress; // No modification or calculation
    
    console.log('🎯 TTS progress tracking started:', {
      startProgress: readingProgress,
      totalWordCount: cachedWordCount,
      remainingWordCount: remainingWordCount,
      speechRate: settings.speechRate,
      estimatedWPM: calculateWordsPerMinute(settings.speechRate)
    });
    
    // Clear any existing interval
    if (ttsProgressRef.current) {
      clearInterval(ttsProgressRef.current);
    }
    
    // Store current values to avoid closure issues
    const speechRate = settings.speechRate;
    const book = currentBook;
    const startProgress = ttsStartProgressRef.current;
    
    // Update progress every 100ms based on estimated reading speed
    // IMPORTANT: Progress ONLY moves forward, never backward
    ttsProgressRef.current = setInterval(() => {
      // Double-check that tracking is still active
      if (!ttsStartTimeRef.current || !ttsProgressRef.current) {
        console.log('🛑 TTS interval fired but tracking was stopped - exiting');
        return;
      }
      
      const elapsedSeconds = (Date.now() - ttsStartTimeRef.current) / 1000;
      const currentWpm = calculateWordsPerMinute(speechRate);
      const currentWordsPerSecond = currentWpm / 60;
      
      // Edge case checks
      if (remainingWordCount <= 0) {
        console.warn('⚠️ TTS: No remaining words to read, stopping tracking');
        return;
      }
      
      if (startProgress >= 1.0) {
        console.warn('⚠️ TTS: Already at 100%, stopping tracking');
        return;
      }
      
      // Calculate progress increment based on words read since TTS started
      const wordsReadSinceStart = elapsedSeconds * currentWordsPerSecond;
      const progressThroughRemainingText = Math.min(1, Math.max(0, wordsReadSinceStart / remainingWordCount));
      
      // Calculate remaining progress range (how much progress is left to fill)
      const remainingProgressRange = Math.max(0, 1.0 - startProgress);
      
      // Calculate new progress - simple and consistent forward movement
      const progressIncrement = progressThroughRemainingText * remainingProgressRange;
      let newProgress = startProgress + progressIncrement;
      
      // Ensure progress ALWAYS moves forward (never goes backward) and caps at 100%
      newProgress = Math.min(1.0, Math.max(lastTtsProgressRef.current, newProgress));
      
      // Only update if progress moved forward - NEVER allow backward movement
      if (newProgress > lastTtsProgressRef.current) {
        const oldProgress = lastTtsProgressRef.current;
        lastTtsProgressRef.current = newProgress;
        setReadingProgress(newProgress);
        
        console.log('📈 PROGRESS FORWARD:', {
          progressBar: {
            from: (oldProgress * 100).toFixed(2) + '%',
            to: (newProgress * 100).toFixed(2) + '%',
            increment: ((newProgress - oldProgress) * 100).toFixed(3) + '%'
          },
          readingPosition: {
            wordsReadSinceStart: wordsReadSinceStart.toFixed(1),
            remainingWords: remainingWordCount,
            completionOfRemaining: (progressThroughRemainingText * 100).toFixed(2) + '%'
          },
          timing: {
            elapsed: elapsedSeconds.toFixed(1) + 's',
            speechRate: speechRate + 'x',
            wpm: currentWpm
          }
        });
      } else if (newProgress < lastTtsProgressRef.current) {
        // Log when progress would go backward (for debugging)
        console.warn('⚠️ PROGRESS BLOCKED (would go backward):', {
          currentProgress: (lastTtsProgressRef.current * 100).toFixed(2) + '%',
          calculatedProgress: (newProgress * 100).toFixed(2) + '%',
          difference: ((newProgress - lastTtsProgressRef.current) * 100).toFixed(3) + '%',
          debugInfo: {
            elapsedSeconds: elapsedSeconds.toFixed(2),
            wordsReadSinceStart: wordsReadSinceStart.toFixed(1),
            progressThroughRemainingText: (progressThroughRemainingText * 100).toFixed(2) + '%',
            remainingProgressRange: (remainingProgressRange * 100).toFixed(2) + '%',
            startProgress: (startProgress * 100).toFixed(2) + '%'
          },
          reason: 'Progress never goes backward - calculation error or race condition'
        });
      } else {
        // Log when progress stays the same (no movement)
        console.log('📊 PROGRESS UNCHANGED:', {
          currentProgress: (lastTtsProgressRef.current * 100).toFixed(2) + '%',
          calculatedProgress: (newProgress * 100).toFixed(2) + '%',
          elapsed: elapsedSeconds.toFixed(1) + 's'
        });
      }
      
      // Enhanced debug logging
      if (Math.floor(elapsedSeconds) % 2 === 0 && Math.floor(elapsedSeconds * 10) % 20 === 0) {
        console.log('🎯 TTS Progress Update:', {
          timing: {
            elapsedSeconds: elapsedSeconds.toFixed(2),
            wpm: currentWpm,
            wordsPerSecond: currentWordsPerSecond.toFixed(2)
          },
          reading: {
            wordsReadSinceStart: wordsReadSinceStart.toFixed(1),
            remainingWords: remainingWordCount,
            completionOfRemaining: (progressThroughRemainingText * 100).toFixed(2) + '%'
          },
          progress: {
            startProgress: (startProgress * 100).toFixed(2) + '%',
            currentProgress: (lastTtsProgressRef.current * 100).toFixed(2) + '%',
            calculatedProgress: (newProgress * 100).toFixed(2) + '%',
            progressIncrement: (progressIncrement * 100).toFixed(2) + '%'
          }
        });
      }
      
      // Update current page and position based on TTS progress using CHARACTER-BASED positioning
      if (book && book.totalLength > 0) {
        const newCharacterPosition = Math.floor(newProgress * book.totalLength);
        
        // Update character position in the book
        dispatch({
          type: 'UPDATE_READING_POSITION',
          payload: { bookId: book.id, position: newCharacterPosition }
        });
        
        // Update current page based on character position
        if (book.pages && book.pages.length > 0) {
          const targetPage = book.pages.find(page => 
            newCharacterPosition >= page.startPosition && newCharacterPosition <= page.endPosition
          );
          if (targetPage) {
            dispatch({
              type: 'UPDATE_CURRENT_PAGE',
              payload: { bookId: book.id, page: targetPage.pageNumber },
            });
          }
        }
      }
    }, 100); // Update every 100ms for smooth progress bar movement
  };
  
  // Stop TTS progress tracking
  const stopTtsProgressTracking = () => {
    const currentProgress = lastTtsProgressRef.current;
    console.log('🛑 Stopping TTS progress tracking - preserving progress at:', (currentProgress * 100).toFixed(2) + '%');
    
    // Clear interval FIRST to prevent any more updates
    if (ttsProgressRef.current) {
      clearInterval(ttsProgressRef.current);
      ttsProgressRef.current = null;
      console.log('🛑 TTS progress interval cleared');
    }
    
    // Clear tracking timestamps but preserve progress state
    ttsStartTimeRef.current = null;
    
    // DIRECT POSITION PRESERVATION: Keep progress exactly where TTS stopped
    setReadingProgress(currentProgress); // No calculation, no interpolation
    
    console.log('🛑 TTS STOPPED - FINAL POSITIONS:', {
      progressBar: {
        finalPercentage: (currentProgress * 100).toFixed(2) + '%',
        preservedAt: 'pause position'
      },
      readingPosition: {
        estimatedCharacterPosition: Math.floor(currentProgress * (currentBook?.content?.length || 0)),
        estimatedWordsRead: Math.floor(currentProgress * cachedWordCount),
        remainingWords: Math.floor((1 - currentProgress) * cachedWordCount)
      }
    });
  };
  
  const handleScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    const scrollY = contentOffset.y;
    
    // Update scroll position for UI purposes only - not connected to reading progress
    setCurrentScrollY(scrollY);
    
    // Note: Reading progress is now independent of scroll position
    // Progress tracking is handled separately through user interactions or TTS
  };

  const handleScrollEnd = () => {
    if (isScrollingToPosition) {
      console.log('📜 Progress bar drag scroll animation completed');
      
      // Clear the scrolling-to-position state to allow normal progress bar tracking
      setIsScrollingToPosition(false);
      
      console.log('✅ Progress bar can now track scroll position normally');
    }
  };

  // Sleep timer functionality
  const setSleepTimerMinutes = (minutes: number) => {
    // Clear any existing timers
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    setSleepTimer(minutes);
    setSleepTimerActive(true);
    setRemainingTime(minutes * 60); // Set remaining time in seconds
    setShowSleepTimerModal(false);
    
    // Start countdown interval (update every second)
    countdownRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          // Timer finished
          clearInterval(countdownRef.current!);
          console.log('💤 Sleep timer triggered - stopping TTS');
          stopReading();
          setSleepTimerActive(false);
          setSleepTimer(null);
          setRemainingTime(0);
          Alert.alert('Sleep Timer', 'Playback stopped by sleep timer');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Set backup timer (in case interval fails)
    sleepTimerRef.current = setTimeout(() => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      console.log('💤 Sleep timer backup triggered - stopping TTS');
      stopReading();
      setSleepTimerActive(false);
      setSleepTimer(null);
      setRemainingTime(0);
      Alert.alert('Sleep Timer', 'Playback stopped by sleep timer');
    }, minutes * 60 * 1000);
  };

  const cancelSleepTimer = () => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    setSleepTimerActive(false);
    setSleepTimer(null);
    setRemainingTime(0);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (ttsProgressRef.current) {
        clearInterval(ttsProgressRef.current);
      }
      if (ttsWordTrackingRef.current) {
        clearInterval(ttsWordTrackingRef.current);
      }
    };
  }, []);

  // Format remaining time for display
  const formatRemainingTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get current words per minute for progress bar calculations
  const currentWPM = calculateWordsPerMinute(settings.speechRate);

  // Fast time calculations using cached word count with second-level accuracy
  const getElapsedTimeInSeconds = useCallback((): number => {
    if (!currentBook) return 0;
    const totalWordCount = getCachedWordCount();
    if (totalWordCount === 0) return 0;
    
    // When TTS is actively running, use actual elapsed time since TTS started
    if (isPlaying && ttsStartTimeRef.current) {
      const actualElapsedSeconds = Math.floor((Date.now() - ttsStartTimeRef.current) / 1000);
      
      // Calculate the base time from where TTS started reading
      const startProgressRatio = ttsStartProgressRef.current;
      const baseWordsRead = totalWordCount * Math.max(0, Math.min(1, startProgressRatio));
      const wordsPerSecond = currentWPM / 60;
      const baseTimeSeconds = Math.round(baseWordsRead / wordsPerSecond);
      
      return baseTimeSeconds + actualElapsedSeconds;
    }
    
    // When not playing TTS, calculate from current position
    // Use drag position when actively dragging, otherwise use reading progress  
    const progressRatio = isDragging ? dragPosition : readingProgress;
    
    const wordsRead = totalWordCount * Math.max(0, Math.min(1, progressRatio));
    const wordsPerSecond = currentWPM / 60; // Convert WPM to words per second
    return Math.round(wordsRead / wordsPerSecond); // Returns seconds
  }, [currentBook, getCachedWordCount, currentWPM, isPlaying, ttsStartTimeRef, ttsStartProgressRef, isDragging, dragPosition, readingProgress]);

  const getTotalTimeInSeconds = useCallback((): number => {
    if (!currentBook) return 0;
    const totalWordCount = getCachedWordCount();
    if (totalWordCount === 0) return 0;
    const wordsPerSecond = currentWPM / 60; // Convert WPM to words per second
    return Math.round(totalWordCount / wordsPerSecond); // Returns total seconds for entire book
  }, [currentBook, getCachedWordCount, currentWPM]);

  // Format seconds into HH:MM:SS or MM:SS format
  const formatTimeFromSeconds = (totalSeconds: number): string => {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) {
      return '0:00';
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  // Debug: Log when speech rate changes (removed problematic function calls)
  useEffect(() => {
    console.log('📊 Speech rate changed:', settings.speechRate, 'WPM:', currentWPM);
    // Removed function calls that were causing infinite re-render
    // Time calculations are now done on-demand when needed
  }, [settings.speechRate, currentWPM]);

  // Calculate total reading duration for current book with second-level accuracy
  const getTotalDurationInSeconds = useCallback((rate: number): number => {
    if (!currentBook?.content) return 0;
    const totalWordCount = getCachedWordCount();
    if (totalWordCount === 0) return 0;
    
    const wpm = calculateWordsPerMinute(rate);
    if (wpm === 0) return 0;
    
    const wordsPerSecond = wpm / 60; // Convert WPM to words per second
    return Math.round(totalWordCount / wordsPerSecond); // Returns total seconds
  }, [currentBook?.content, getCachedWordCount]);

  // Format duration with ~ prefix for display in speed modal
  const formatDurationWithPrefix = (totalSeconds: number): string => {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) {
      return '~0:00';
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    if (hours > 0) {
      return `~${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `~${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };


  const calculateScrollFromPercentage = (percentage: number): number => {
    const maxScroll = Math.max(0, contentHeight - containerHeight);
    return percentage * maxScroll;
  };

  const getCurrentProgressPercentage = (): number => {
    // Return reading progress (independent of scroll position)
    return readingProgress;
  };
  
  // Helper function to log complete state for debugging
  const logCompleteState = (context: string) => {
    if (!currentBook) return;
    
    console.log(`🔍 COMPLETE STATE - ${context}:`, {
      progressBar: {
        displayedPercentage: (readingProgress * 100).toFixed(2) + '%',
        lastTtsProgress: (lastTtsProgressRef.current * 100).toFixed(2) + '%',
        isDragging: isDragging,
        dragPosition: isDragging ? (dragPosition * 100).toFixed(2) + '%' : 'N/A'
      },
      readingPosition: {
        currentCharacterIndex: Math.floor(readingProgress * (currentBook.content?.length || 0)),
        totalCharacters: currentBook.content?.length || 0,
        currentWordIndex: Math.floor(readingProgress * cachedWordCount),
        totalWords: cachedWordCount,
        percentageRead: (readingProgress * 100).toFixed(2) + '%'
      },
      bookState: {
        currentPage: currentBook.currentPage,
        totalPages: currentBook.totalPages,
        title: currentBook.title
      },
      ttsState: {
        isPlaying: isPlaying,
        hasActiveTracking: !!ttsProgressRef.current,
        startTime: ttsStartTimeRef.current ? new Date(ttsStartTimeRef.current).toLocaleTimeString() : 'N/A'
      }
    });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    
    onPanResponderGrant: (event) => {
      console.log('🎯 Progress bar drag started');
      
      // Stop TTS if it's playing when user starts dragging
      if (isPlaying) {
        stopReading();
      }
      
      setIsDragging(true);
      
      const { locationX } = event.nativeEvent;
      
      // For smooth tracking, we want the thumb to move directly to where the user touches
      // Calculate the percentage based on touch position
      const initialPercentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
      
      // Set drag position to follow finger immediately - no offset needed for smooth tracking
      setDragPosition(initialPercentage);
      
      console.log('🎯 Drag started - Touch at:', locationX, 'Width:', progressBarWidth, 'Initial percentage:', initialPercentage.toFixed(3));
    },
    
    onPanResponderMove: (event) => {
      const { locationX } = event.nativeEvent;
      
      // For smooth tracking, directly convert touch position to percentage
      // The thumb should follow the finger exactly
      const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
      
      // Update drag position immediately for smooth visual tracking
      setDragPosition(percentage);
      
      // Don't scroll content during drag - only update visual indicator
      console.log('👆 Finger tracking - Touch at:', locationX.toFixed(1), 'Percentage:', percentage.toFixed(3));
    },
    
    onPanResponderRelease: () => {
      console.log('🎯 Progress bar drag released at position:', dragPosition);
      setIsDragging(false);
      
      // DIRECT POSITION SET: Jump immediately to user-selected position using CHARACTER-BASED positioning
      if (!currentBook) return;
      
      const newCharacterPosition = Math.floor(dragPosition * currentBook.totalLength);
      
      console.log('🎯 PROGRESS BAR: DIRECT POSITION SET (CHARACTER-BASED):', {
        action: 'User clicked/dragged to position',
        selectedPosition: (dragPosition * 100).toFixed(2) + '%',
        previousPosition: (readingProgress * 100).toFixed(2) + '%',
        newCharacterPosition: newCharacterPosition,
        totalLength: currentBook.totalLength,
        behavior: 'Jump directly - no interpolation'
      });
      
      // Set progress to EXACTLY where user clicked/dragged
      setReadingProgress(dragPosition);
      lastTtsProgressRef.current = dragPosition; // Update ref to match
      
      // Update current position in the book to match the drag position
      dispatch({
        type: 'UPDATE_READING_POSITION',
        payload: { bookId: currentBook.id, position: newCharacterPosition }
      });
      
      // Update current page based on character position
      if (currentBook && currentBook.pages && currentBook.pages.length > 0) {
        const targetPage = currentBook.pages.find(page => 
          newCharacterPosition >= page.startPosition && newCharacterPosition <= page.endPosition
        );
        if (targetPage) {
          dispatch({
            type: 'UPDATE_CURRENT_PAGE',
            payload: { bookId: currentBook.id, page: targetPage.pageNumber },
          });
        }
      }
      
      // Center the current reading position in viewport after progress bar drag
      // Update TTS word position to match new character position for proper centering
      setCurrentTTSWordPosition(newCharacterPosition);
      
      // Use a timeout to ensure state updates complete before auto-scroll
      setTimeout(() => {
        // Load chunks around the new position if needed
        if (allBookChunks.length > 0) {
          const { chunks, currentIndex } = getVisibleChunksAroundPosition(allBookChunks, newCharacterPosition);
          setVisibleChunks(chunks);
          setCurrentChunkIndex(currentIndex);
          
          // Center the new reading position
          setTimeout(() => {
            autoScrollToCurrentWord(true);
          }, 100);
          
          console.log('📜 Progress bar drag: centered new reading position:', {
            newCharacterPosition,
            newProgress: (dragPosition * 100).toFixed(2) + '%',
            loadedChunks: chunks.length,
            currentIndex
          });
        }
      }, 50);
    },
  });

  if (!currentBook) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: settings.backgroundColor }]}>
        <Ionicons name="book-outline" size={80} color="#ccc" />
        <Text style={[styles.emptyText, { color: settings.textColor }]}>No book selected</Text>
        <Text style={[styles.emptySubtext, { color: settings.textColor, fontSize: settings.fontSize * 0.9 }]}>
          Go to Library to select a book to read
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: settings.backgroundColor }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goToLibrary} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#666" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowChapterModal(true)} style={styles.headerIcon}>
            <Ionicons name="list-outline" size={22} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity onPress={addBookmark} style={styles.headerIcon}>
            <Ionicons name="bookmark-outline" size={22} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAIModal(true)} style={styles.headerIcon}>
            <Ionicons name="menu-outline" size={22} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.contentArea, styles.textContainer]}>
        {renderContent()}
        
        {/* Auto-scroll button */}
        {showAutoScrollButton && isPlaying && (
          <TouchableOpacity 
            style={styles.autoScrollButton}
            onPress={() => autoScrollToCurrentWord(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-down" size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.audioPlayerContainer}>
          {/* Time and Progress Bar */}
          <View style={styles.timeProgressContainer} key={`time-${settings.speechRate}`}>
            <View style={styles.timeLabels}>
              <Text style={styles.timeText}>
                {formatTimeFromSeconds(getElapsedTimeInSeconds())}
              </Text>
              <Text style={styles.timeText}>
                {formatTimeFromSeconds(getTotalTimeInSeconds())}
              </Text>
            </View>
            
            <View 
              style={styles.progressBarContainer}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                setProgressBarWidth(width);
              }}
              {...panResponder.panHandlers}
            >
              <View style={styles.progressBar}>
                {/* Progress bar: Shows exact user position or TTS position - no interpolation */}
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${(isDragging ? dragPosition : getCurrentProgressPercentage()) * 100}%`
                    }
                  ]} 
                />
                <View 
                  style={[
                    styles.progressThumb,
                    { 
                      left: `${(isDragging ? dragPosition : getCurrentProgressPercentage()) * 100}%`
                    }
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Audio Controls */}
          <View style={styles.audioControls}>
            {/* Sleep Timer on the left */}
            <View style={styles.timerContainer}>
              <TouchableOpacity 
                style={styles.sideControlButton}
                onPress={() => setShowSleepTimerModal(true)}
              >
                <Ionicons 
                  name="timer-outline" 
                  size={24} 
                  color={sleepTimerActive ? "#007AFF" : "#666"} 
                />
              </TouchableOpacity>
              {sleepTimerActive && remainingTime > 0 && (
                <Text style={styles.remainingTimeText}>
                  {formatRemainingTime(remainingTime)}
                </Text>
              )}
            </View>

            <TouchableOpacity 
              style={styles.skipButton}
              onPress={() => {
                // If TTS is playing, stop it first
                if (isPlaying) {
                  stopReading();
                }
                
                // Rewind reading progress by ~5%
                advanceReadingProgress(-0.05);
                
                // Also scroll up for visual context
                if (flatListRef.current) {
                  const newY = Math.max(0, currentScrollY - 300);
                  flatListRef.current.scrollToOffset({ offset: newY, animated: true });
                }
              }}
            >
              <Ionicons name="play-back" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.playButton}
              onPress={isPlaying ? stopReading : startReading}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={28} 
                color="white" 
              />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.skipButton}
              onPress={() => {
                // If TTS is playing, stop it first
                if (isPlaying) {
                  stopReading();
                }
                
                // Advance reading progress by ~5%
                advanceReadingProgress(0.05);
                
                // Also scroll down for visual context
                if (flatListRef.current) {
                  flatListRef.current.scrollToOffset({ offset: currentScrollY + 300, animated: true });
                }
              }}
            >
              <Ionicons name="play-forward" size={24} color="#666" />
            </TouchableOpacity>

            {/* Speed control on the right */}
            <TouchableOpacity 
              style={styles.sideControlButton}
              onPress={() => setShowSpeedModal(true)}
            >
              <Text style={styles.speedControlText}>x{settings.speechRate.toFixed(1)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={showAIModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <AIAssistant
          selectedText={selectedText}
          book={currentBook}
          onClose={() => setShowAIModal(false)}
        />
      </Modal>

      <Modal
        visible={showChapterModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.chapterModalContainer}>
          <View style={styles.chapterModalHeader}>
            <Text style={styles.chapterModalTitle}>Chapters</Text>
            <TouchableOpacity onPress={() => setShowChapterModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.chapterList}>
            {currentBook.chapters && currentBook.chapters.length > 0 ? (
              currentBook.chapters.map((chapter) => (
                <TouchableOpacity
                  key={chapter.id}
                  style={[
                    styles.chapterItem,
                    currentBook.currentPage >= chapter.startPage && 
                    (!chapter.endPage || currentBook.currentPage <= chapter.endPage) && 
                    styles.currentChapterItem
                  ]}
                  onPress={() => goToChapter(chapter.startPage)}
                >
                  <View style={styles.chapterInfo}>
                    <Text style={styles.chapterTitle}>{chapter.title}</Text>
                    <Text style={styles.chapterPages}>
                      Page {chapter.startPage}
                      {chapter.endPage && ` - ${chapter.endPage}`}
                    </Text>
                  </View>
                  <Ionicons 
                    name="chevron-forward" 
                    size={20} 
                    color={
                      currentBook.currentPage >= chapter.startPage && 
                      (!chapter.endPage || currentBook.currentPage <= chapter.endPage)
                        ? "#007AFF" 
                        : "#ccc"
                    } 
                  />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.noChaptersContainer}>
                <Ionicons name="book-outline" size={48} color="#ccc" />
                <Text style={styles.noChaptersText}>No chapters detected</Text>
                <Text style={styles.noChaptersSubtext}>
                  This book doesn&apos;t have recognizable chapter markers
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showSleepTimerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={true}
      >
        <View style={styles.sleepTimerModalOverlay}>
          <View style={styles.sleepTimerModalContainer}>
            <Text style={styles.sleepTimerTitle}>Sleep Timer</Text>
            <Text style={styles.sleepTimerSubtitle}>
              Select the time the playback will stop after
            </Text>
            
            <View style={styles.sleepTimerOptions}>
              {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={styles.sleepTimerOption}
                  onPress={() => setSleepTimerMinutes(minutes)}
                >
                  <Text style={styles.sleepTimerOptionText}>
                    {minutes} minute{minutes !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.sleepTimerButtons}>
              <TouchableOpacity
                style={styles.sleepTimerCancelButton}
                onPress={() => setShowSleepTimerModal(false)}
              >
                <Text style={styles.sleepTimerCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              {sleepTimerActive && (
                <TouchableOpacity
                  style={styles.sleepTimerSetButton}
                  onPress={() => {
                    cancelSleepTimer();
                    setShowSleepTimerModal(false);
                  }}
                >
                  <Text style={styles.sleepTimerSetText}>Cancel Timer</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSpeedModal}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={true}
      >
        <View style={styles.speedModalOverlay}>
          <View style={styles.speedModalContainer}>
            <Text style={styles.speedModalTitle}>
              {settings.speechRate < 1.0 ? 'Slow' : 
               settings.speechRate === 1.0 ? 'Normal' : 'Fast'}
            </Text>
            <Text style={styles.speedModalDuration}>
              Duration: {formatDurationWithPrefix(getTotalDurationInSeconds(settings.speechRate))}
            </Text>
            {cachedWordCount > 0 && (
              <Text style={styles.wordCountText}>
                {cachedWordCount.toLocaleString()} words in book
              </Text>
            )}
            
            {/* Current Speed Display */}
            <View style={styles.currentSpeedContainer}>
              <TouchableOpacity 
                style={styles.speedAdjustButton}
                onPress={() => {
                  const newRate = Math.max(0.5, settings.speechRate - 0.1);
                  const finalRate = parseFloat(newRate.toFixed(1));
                  dispatch({
                    type: 'UPDATE_SETTINGS',
                    payload: { speechRate: finalRate },
                  });
                }}
              >
                <Text style={styles.speedAdjustText}>−</Text>
              </TouchableOpacity>
              
              <View style={styles.currentSpeedDisplay}>
                <Text style={styles.currentSpeedText}>{settings.speechRate.toFixed(1)}×</Text>
                <Text style={styles.wpmText}>{calculateWordsPerMinute(settings.speechRate)} words per minute</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.speedAdjustButton}
                onPress={() => {
                  const newRate = Math.min(2.5, settings.speechRate + 0.1);
                  const finalRate = parseFloat(newRate.toFixed(1));
                  dispatch({
                    type: 'UPDATE_SETTINGS',
                    payload: { speechRate: finalRate },
                  });
                }}
              >
                <Text style={styles.speedAdjustText}>+</Text>
              </TouchableOpacity>
            </View>
            
            {/* Speed Presets */}
            <View style={styles.speedPresets}>
              {[0.8, 1.0, 1.2, 1.5, 2.0, 2.5].map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.speedPreset,
                    settings.speechRate === rate && styles.selectedSpeedPreset
                  ]}
                  onPress={() => {
                    dispatch({
                      type: 'UPDATE_SETTINGS',
                      payload: { speechRate: rate },
                    });
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[
                    styles.speedPresetText,
                    settings.speechRate === rate && styles.selectedSpeedPresetText
                  ]}>
                    {rate}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Close Button */}
            <TouchableOpacity
              style={styles.speedModalCloseButton}
              onPress={() => setShowSpeedModal(false)}
            >
              <Text style={styles.speedModalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    zIndex: 1,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    padding: 8,
    marginLeft: 8,
  },
  contentArea: {
    flex: 1,
  },
  textContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  textContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  bookText: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  chunkContainer: {
    paddingBottom: 4, // Small spacing between chunks
  },
  highlightedWord: {
    backgroundColor: '#2196F3', // Blue background for current word being read
    color: 'white', // White text for contrast
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    shadowColor: '#2196F3',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'white',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  audioPlayerContainer: {
    width: '100%',
  },
  timeProgressContainer: {
    marginBottom: 20,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  progressBarContainer: {
    width: '100%',
    paddingVertical: 12, // Increased touch area for better responsiveness
    paddingHorizontal: 4, // Small horizontal padding for edge touches
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginLeft: -8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  audioControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  circularRewindButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  circularForwardButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  circularButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  skipButton: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
  },
  fastButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    position: 'relative',
  },
  fastButtonText: {
    position: 'absolute',
    bottom: -2,
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },
  skipButton15: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularButtonContainer: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleBackground: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    zIndex: 1,
  },
  numberOverlay: {
    position: 'absolute',
    fontSize: 14,
    color: '#333',
    fontWeight: '700',
    zIndex: 3,
    textAlign: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  bottomRowControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 60,
    marginTop: 8,
  },
  bottomControlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  bottomControlText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
    fontWeight: '400',
  },
  speedControlText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  sideControlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    minWidth: 48,
    minHeight: 48,
  },
  sideControlText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    fontWeight: '400',
    textAlign: 'center',
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  remainingTimeText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: -2,
    textAlign: 'center',
  },
  chapterModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chapterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  chapterModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  chapterList: {
    flex: 1,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  currentChapterItem: {
    backgroundColor: '#f8f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  chapterInfo: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  chapterPages: {
    fontSize: 13,
    color: '#666',
  },
  noChaptersContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  noChaptersText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  noChaptersSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  sleepTimerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sleepTimerModalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '70%',
  },
  sleepTimerTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
    marginBottom: 8,
  },
  sleepTimerSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  sleepTimerOptions: {
    marginBottom: 30,
  },
  sleepTimerOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 1,
    backgroundColor: '#f8f9fa',
  },
  sleepTimerOptionText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
  },
  sleepTimerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  sleepTimerCancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  sleepTimerCancelText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  sleepTimerSetButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#34C759',
  },
  sleepTimerSetText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  speedModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  speedModalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '80%',
  },
  speedModalTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
    marginBottom: 8,
  },
  speedModalDuration: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  wordCountText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
  },
  currentSpeedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  speedAdjustButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedAdjustText: {
    fontSize: 24,
    color: '#333',
    fontWeight: '300',
  },
  currentSpeedDisplay: {
    alignItems: 'center',
    marginHorizontal: 30,
    flex: 1,
  },
  currentSpeedText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#333',
    marginBottom: 5,
  },
  wpmText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  speedPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 40,
    gap: 10,
  },
  speedPreset: {
    width: '30%',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedSpeedPreset: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  speedPresetText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  selectedSpeedPresetText: {
    color: 'white',
  },
  speedModalCloseButton: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  speedModalCloseText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  autoScrollButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 999,
  },
});