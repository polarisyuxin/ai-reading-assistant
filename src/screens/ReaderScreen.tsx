import React, { useState, useRef, useEffect } from 'react';
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
  
  // Loading and content state
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [contentChunks, setContentChunks] = useState<ChunkItem[]>([]);
  
  const [progressBarWidth, setProgressBarWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0); // Track drag position as percentage (0-1)
  const [isScrollingToPosition, setIsScrollingToPosition] = useState(false); // Track if we're animating scroll from progress bar drag
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

  // Cache word count when book changes for faster duration calculations
  useEffect(() => {
    if (currentBook?.content && currentBook.id !== lastBookId) {
      console.log('📊 Calculating word count for book:', currentBook.title);
      const startTime = Date.now();
      const wordStats = countWords(currentBook.content);
      const wordCount = wordStats.words || 0;
      setCachedWordCount(wordCount);
      const endTime = Date.now();
      console.log(`📊 Word count calculated: ${wordCount} words in ${endTime - startTime}ms`);
    } else if (!currentBook?.content) {
      setCachedWordCount(0);
    }
  }, [currentBook?.id, currentBook?.content, currentBook?.title, lastBookId]);

  const startReading = async () => {
    if (!currentBook || !currentBook.content) {
      Alert.alert('Error', 'No content available to read');
      return;
    }

    // Calculate starting position based on current reading progress
    const fullContent = currentBook.content;
    const startCharIndex = Math.floor(readingProgress * fullContent.length);
    
    // Read from current progress position to the end
    const textToRead = fullContent.substring(startCharIndex);
    
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
    
    // Calculate word count for the remaining text to be read
    const remainingWordStats = countWords(textToRead);
    const remainingWordCount = remainingWordStats.words || 0;
    
    // Safety check for minimum content
    if (remainingWordCount < 5) {
      Alert.alert('Info', 'Very little content remaining to read. You may be near the end of the book.');
      console.warn('⚠️ TTS: Very few words remaining:', remainingWordCount);
    }
    
    console.log('🔊 Starting TTS with language:', ttsLanguage, 'for text:', textToRead.substring(0, 50) + '...');
    console.log('📊 TTS word count:', {
      remainingWords: remainingWordCount,
      totalWords: cachedWordCount,
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
    
    startTtsProgressTracking(remainingWordCount);
    logCompleteState('TTS STARTED');

    Speech.speak(textToRead, {
      rate: settings.speechRate,
      voice: settings.speechVoice,
      language: ttsLanguage,
      onDone: () => {
        console.log('🎵 TTS finished reading all remaining content - setting to 100%');
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        // Only set to 100% when TTS naturally finishes reading all remaining content
        setReadingProgress(1);
      },
      onStopped: () => {
        console.log('🎵 TTS manually stopped - preserving current progress');
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        // NEVER change progress on manual stop - it stays wherever TTS was paused
      },
      onError: (error) => {
        console.error('TTS Error:', error);
        dispatch({ type: 'SET_PLAYING', payload: false });
        stopTtsProgressTracking();
        Alert.alert('Speech Error', 'Text-to-speech failed. Try adjusting the language setting.');
      },
    });
  };

  const stopReading = () => {
    console.log('⏸️ Stopping TTS - current progress:', (readingProgress * 100).toFixed(2) + '%');
    
    // Stop TTS tracking FIRST to prevent any final calculations
    stopTtsProgressTracking();
    
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

  // Content chunking constants
  const CHUNK_SIZE = 2000; // Characters per chunk for optimal performance
  
  // Define chunk item type
  interface ChunkItem {
    id: string;
    text: string;
    startIndex: number;
    endIndex: number;
  }
  
  // Asynchronous content chunking to prevent UI blocking
  const chunkContentAsync = async (content: string): Promise<ChunkItem[]> => {
    return new Promise((resolve) => {
      // Use requestIdleCallback or setTimeout to make chunking non-blocking
      const processChunks = () => {
        const chunks: ChunkItem[] = [];
        
        // Split content at natural break points (sentences/paragraphs) when possible
        for (let i = 0; i < content.length; i += CHUNK_SIZE) {
          let endIndex = Math.min(i + CHUNK_SIZE, content.length);
          
          // Try to find a natural break point near the end of the chunk
          if (endIndex < content.length) {
            const searchEnd = Math.min(endIndex + 200, content.length);
            const naturalBreaks = ['\n\n', '. ', '! ', '? '];
            
            for (const breakPoint of naturalBreaks) {
              const breakIndex = content.lastIndexOf(breakPoint, searchEnd);
              if (breakIndex > endIndex - 100 && breakIndex < searchEnd) {
                endIndex = breakIndex + breakPoint.length;
                break;
              }
            }
          }
          
          const chunk = content.substring(i, endIndex);
          chunks.push({
            id: i.toString(),
            text: chunk,
            startIndex: i,
            endIndex: endIndex
          });
          
          // Update i to the actual end index for next iteration
          i = endIndex - CHUNK_SIZE;
        }
        
        console.log(`📚 Content chunked into ${chunks.length} pieces for smooth scrolling`);
        resolve(chunks);
      };
      
      // Use setTimeout to prevent blocking
      setTimeout(processChunks, 0);
    });
  };
  
  // Load content chunks when book changes
  useEffect(() => {
    if (currentBook?.content && currentBook.id !== lastBookId) {
      console.log('🚀 Starting content processing for smooth transition');
      setIsContentLoading(true);
      setContentChunks([]); // Clear previous chunks immediately
      
      // Start chunking process
      chunkContentAsync(currentBook.content)
        .then((chunks) => {
          setContentChunks(chunks);
          setIsContentLoading(false);
          console.log('✅ Content ready for smooth scrolling');
        })
        .catch((error) => {
          console.error('❌ Error chunking content:', error);
          setIsContentLoading(false);
        });
    } else if (!currentBook?.content) {
      setContentChunks([]);
      setIsContentLoading(false);
    }
  }, [currentBook?.content, currentBook?.id, lastBookId]);
  
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
  
  const renderChunk = ({ item, index }: { item: ChunkItem; index: number }) => {
    return (
      <View style={styles.chunkContainer}>
        <Text 
          key={item.id}
          style={[styles.bookText, getTextStyle()]}
          onLayout={(event) => {
            // Update estimated height based on actual rendered height
            if (index === 0) {
              const { height } = event.nativeEvent.layout;
              setEstimatedItemHeight(height);
            }
          }}
        >
          {item.text}
        </Text>
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
    if (contentChunks.length === 0 && isContentLoading) {
      return <View style={styles.textContent} />;
    }

    console.log('📱 Rendering optimized content with', contentChunks.length, 'chunks');
    
    return (
      <FlatList
        ref={flatListRef}
        data={contentChunks}
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
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onContentSizeChange={(width, height) => setContentHeight(height)}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setContainerHeight(height);
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
      const wordsReadSinceStart = elapsedSeconds * currentWordsPerSecond;
      
      // Edge case checks
      if (remainingWordCount <= 0) {
        console.warn('⚠️ TTS: No remaining words to read, stopping tracking');
        return;
      }
      
      if (startProgress >= 1.0) {
        console.warn('⚠️ TTS: Already at 100%, stopping tracking');
        return;
      }
      
      // Calculate progress through remaining text with safety checks
      const progressThroughRemainingText = Math.min(1, Math.max(0, wordsReadSinceStart / remainingWordCount));
      
      // Calculate remaining progress range
      const remainingProgressRange = Math.max(0, 1.0 - startProgress);
      
      // Calculate new progress - ONLY move forward, never backward
      const progressIncrement = progressThroughRemainingText * remainingProgressRange;
      let newProgress = startProgress + progressIncrement;
      
      // Ensure progress only moves forward and never exceeds reasonable bounds
      // Math.max ensures we never go backward from current position
      newProgress = Math.min(0.99, Math.max(lastTtsProgressRef.current, newProgress));
      
      // Conservative progress: use realistic reading speed limits
      // Estimate words per second and convert to progress per second
      const expectedProgressPerSecond = currentWordsPerSecond / remainingWordCount;
      const maxAllowedProgress = lastTtsProgressRef.current + (elapsedSeconds * expectedProgressPerSecond);
      
      // Use the more conservative estimate
      newProgress = Math.min(newProgress, maxAllowedProgress);
      
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
            estimatedWordsRead: wordsReadSinceStart.toFixed(1),
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
          elapsedSeconds: elapsedSeconds.toFixed(2),
          wpm: currentWpm,
          wordsPerSecond: currentWordsPerSecond.toFixed(2),
          wordsReadSinceStart: wordsReadSinceStart.toFixed(1),
          remainingWordCount: remainingWordCount,
          progressThroughRemainingText: (progressThroughRemainingText * 100).toFixed(2) + '%',
          remainingProgressRange: (remainingProgressRange * 100).toFixed(2) + '%',
          progressIncrement: (progressIncrement * 100).toFixed(2) + '%',
          startProgress: (startProgress * 100).toFixed(2) + '%',
          newProgress: (newProgress * 100).toFixed(2) + '%',
          lastTtsProgress: (lastTtsProgressRef.current * 100).toFixed(2) + '%',
          stateReadingProgress: (readingProgress * 100).toFixed(2) + '%'
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

  const handleScrollEnd = (event: any) => {
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
  const getElapsedTimeInSeconds = (): number => {
    if (!currentBook || cachedWordCount === 0) return 0;
    
    // Use drag position when actively dragging, otherwise use reading progress
    const progressRatio = isDragging ? dragPosition : readingProgress;
    
    const wordsRead = cachedWordCount * Math.max(0, Math.min(1, progressRatio));
    const wordsPerSecond = currentWPM / 60; // Convert WPM to words per second
    return Math.round(wordsRead / wordsPerSecond); // Returns seconds
  };

  const getTotalTimeInSeconds = (): number => {
    if (!currentBook || cachedWordCount === 0) return 0;
    const wordsPerSecond = currentWPM / 60; // Convert WPM to words per second
    return Math.round(cachedWordCount / wordsPerSecond); // Returns total seconds for entire book
  };

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

  // Debug: Log when speech rate or reading progress changes
  useEffect(() => {
    console.log('📊 Speech rate changed:', settings.speechRate, 'WPM:', currentWPM);
    if (currentBook && cachedWordCount > 0) {
      const elapsedSeconds = getElapsedTimeInSeconds();
      const totalSeconds = getTotalTimeInSeconds();
      console.log('📊 Fast time calculations:', {
        readingProgress: readingProgress,
        cachedWordCount: cachedWordCount,
        elapsedSeconds: elapsedSeconds,
        totalSeconds: totalSeconds,
        formattedElapsed: formatTimeFromSeconds(elapsedSeconds),
        formattedTotal: formatTimeFromSeconds(totalSeconds)
      });
    }
  }, [settings.speechRate, currentWPM, readingProgress, cachedWordCount, currentBook, isDragging, dragPosition]);

  // Calculate total reading duration for current book with second-level accuracy
  const getTotalDurationInSeconds = (rate: number): number => {
    if (!currentBook?.content || cachedWordCount === 0) return 0;
    
    const wpm = calculateWordsPerMinute(rate);
    if (wpm === 0) return 0;
    
    const wordsPerSecond = wpm / 60; // Convert WPM to words per second
    return Math.round(cachedWordCount / wordsPerSecond); // Returns total seconds
  };

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
    
    onPanResponderRelease: (event) => {
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
      
      // Optionally scroll to a position that represents the reading progress
      // This is for visual context, not for progress tracking
      const targetScroll = calculateScrollFromPercentage(dragPosition);
      if (flatListRef.current && targetScroll >= 0) {
        setIsScrollingToPosition(true);
        console.log('📜 Scrolling for visual context to position:', targetScroll);
        flatListRef.current.scrollToOffset({ 
          offset: targetScroll, 
          animated: true
        });
      }
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
});