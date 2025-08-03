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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import AIAssistant from '../components/AIAssistant';
import { detectPrimaryLanguage, countWords } from '../utils/textUtils';
import { calculateElapsedTime, calculateRemainingTime, formatTime, calculateWordsPerMinute } from '../utils/timeUtils';

export default function ReaderScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useAppContext();
  const { currentBook, settings, isPlaying } = state;
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [cachedWordCount, setCachedWordCount] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const [lastBookId, setLastBookId] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  // Track book changes without auto-rendering
  useEffect(() => {
    if (currentBook && currentBook.id !== lastBookId) {
      setLastBookId(currentBook.id);
      console.log('📚 New book selected');
    }
  }, [currentBook?.id]);

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
    }
  }, [currentBook?.totalPages, currentBook?.currentPage]);

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
  }, [currentBook?.id, currentBook?.content, lastBookId]);

  const startReading = async () => {
    if (!currentBook || !currentBook.content) {
      Alert.alert('Error', 'No content available to read');
      return;
    }

    const currentPage = getCurrentPage();
    if (!currentPage) {
      Alert.alert('Error', 'No page content found');
      return;
    }

    const textToRead = currentPage.content;
    
    if (!textToRead.trim()) {
      Alert.alert('Error', 'No text content found on this page');
      return;
    }
    
    // Auto-detect language for better TTS if not manually set
    const detectedLanguage = detectPrimaryLanguage(textToRead);
    let ttsLanguage = settings.speechLanguage;
    
    // Auto-switch to Chinese TTS for Chinese text if currently set to English
    if (detectedLanguage === 'chinese' && settings.speechLanguage === 'en-US') {
      ttsLanguage = 'zh-CN'; // Default to Simplified Chinese
      console.log('🎵 Auto-detected Chinese text, switching TTS to Chinese');
    }
    
    console.log('🔊 Starting TTS with language:', ttsLanguage, 'for text:', textToRead.substring(0, 50) + '...');
    
    dispatch({ type: 'SET_PLAYING', payload: true });

    Speech.speak(textToRead, {
      rate: settings.speechRate,
      voice: settings.speechVoice,
      language: ttsLanguage,
      onDone: () => {
        dispatch({ type: 'SET_PLAYING', payload: false });
        // Auto-advance to next page if available
        if (currentBook.currentPage < currentBook.totalPages) {
          dispatch({
            type: 'UPDATE_CURRENT_PAGE',
            payload: { bookId: currentBook.id, page: currentBook.currentPage + 1 },
          });
        }
      },
      onStopped: () => {
        dispatch({ type: 'SET_PLAYING', payload: false });
      },
      onError: (error) => {
        console.error('TTS Error:', error);
        dispatch({ type: 'SET_PLAYING', payload: false });
        Alert.alert('Speech Error', 'Text-to-speech failed. Try adjusting the language setting.');
      },
    });
  };

  const stopReading = () => {
    Speech.stop();
    dispatch({ type: 'SET_PLAYING', payload: false });
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

  const renderText = () => {
    console.log('renderText: Current book:', currentBook?.title, 'Content length:', currentBook?.content?.length);
    
    if (!currentBook || !currentBook.content) {
      console.log('renderText: No book or content available');
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
        <Text style={[styles.bookText, noContentStyle]}>
          No content available
        </Text>
      );
    }

    const currentPage = getCurrentPage();
    if (!currentPage) {
      console.log('renderText: No current page available');
      const noPageStyle = Platform.select({
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
        <Text style={[styles.bookText, noPageStyle]}>
          No page content available
        </Text>
      );
    }

    console.log('renderText: Rendering page content, length:', currentPage.content.length);
    console.log('📱 Current text style:', {
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * 1.75,
      textColor: settings.textColor
    });
    
    // iOS-specific text styling
    const textStyle = Platform.select({
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
    
    return (
      <View key={`text-${renderKey}`}>
        <Text style={[styles.bookText, textStyle]}>
          {currentPage.content}
        </Text>
      </View>
    );
  };

  const goToLibrary = () => {
    navigation.navigate('Library' as never);
  };

  const goToChapter = (chapterStartPage: number) => {
    dispatch({
      type: 'UPDATE_CURRENT_PAGE',
      payload: { bookId: currentBook.id, page: chapterStartPage },
    });
    setShowChapterModal(false);
  };

  const handleContentPress = (event: any) => {
    const { locationX } = event.nativeEvent;
    const screenWidth = event.target.layout?.width || 400;
    
    if (locationX < screenWidth / 2) {
      // Left side - previous page
      if (currentBook.currentPage > 1) {
        dispatch({
          type: 'UPDATE_CURRENT_PAGE',
          payload: { bookId: currentBook.id, page: currentBook.currentPage - 1 },
        });
      }
    } else {
      // Right side - next page
      if (currentBook.currentPage < currentBook.totalPages) {
        dispatch({
          type: 'UPDATE_CURRENT_PAGE',
          payload: { bookId: currentBook.id, page: currentBook.currentPage + 1 },
        });
      }
    }
  };

  const [progressBarWidth, setProgressBarWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [tempPage, setTempPage] = useState(currentBook?.currentPage || 1);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

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
    };
  }, []);

  // Format remaining time for display
  const formatRemainingTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Calculate words per minute based on speech rate
  const getWordsPerMinute = (rate: number): number => {
    return Math.round(200 * rate); // Base rate of 200 WPM at 1x speed
  };

  // Get current words per minute for progress bar calculations
  const currentWPM = calculateWordsPerMinute(settings.speechRate);

  // Fast time calculations using cached word count
  const getElapsedTime = (): number => {
    if (!currentBook || cachedWordCount === 0 || currentBook.totalPages === 0) return 0;
    const progressRatio = (currentBook.currentPage - 1) / currentBook.totalPages;
    const wordsRead = Math.round(cachedWordCount * progressRatio);
    return Math.ceil(wordsRead / currentWPM); // Returns minutes
  };

  const getTotalTime = (): number => {
    if (!currentBook || cachedWordCount === 0) return 0;
    return Math.ceil(cachedWordCount / currentWPM); // Returns total minutes for entire book
  };

  // Debug: Log when speech rate changes
  useEffect(() => {
    console.log('📊 Speech rate changed:', settings.speechRate, 'WPM:', currentWPM);
    if (currentBook && cachedWordCount > 0) {
      const elapsed = getElapsedTime();
      const total = getTotalTime();
      console.log('📊 Fast time calculations:', {
        currentPage: currentBook.currentPage,
        totalPages: currentBook.totalPages,
        cachedWordCount: cachedWordCount,
        progressRatio: currentBook.currentPage / currentBook.totalPages,
        elapsed: elapsed,
        total: total,
        formattedElapsed: formatTime(elapsed),
        formattedTotal: formatTime(total)
      });
    }
  }, [settings.speechRate, currentWPM, currentBook?.currentPage, cachedWordCount]);

  // Calculate total reading duration for current book (using cached word count)
  const getTotalDuration = (rate: number): string => {
    if (!currentBook?.content || cachedWordCount === 0) return '~0:00';
    
    const wpm = getWordsPerMinute(rate);
    if (wpm === 0) return '~0:00';
    
    const totalMinutes = Math.ceil(cachedWordCount / wpm);
    
    if (isNaN(totalMinutes) || totalMinutes === 0) {
      return '~0:00';
    }
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `~${hours}:${minutes.toString().padStart(2, '0')}:00`;
    } else {
      return `~${minutes}:00`;
    }
  };

  const calculatePageFromPosition = (locationX: number) => {
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    return Math.max(1, Math.min(currentBook.totalPages, Math.round(percentage * currentBook.totalPages)));
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    
    onPanResponderGrant: (event) => {
      setIsDragging(true);
      const { locationX } = event.nativeEvent;
      const targetPage = calculatePageFromPosition(locationX);
      setTempPage(targetPage);
    },
    
    onPanResponderMove: (event) => {
      const { locationX } = event.nativeEvent;
      const targetPage = calculatePageFromPosition(locationX);
      setTempPage(targetPage);
    },
    
    onPanResponderRelease: (event) => {
      const { locationX } = event.nativeEvent;
      const targetPage = calculatePageFromPosition(locationX);
      
      dispatch({
        type: 'UPDATE_CURRENT_PAGE',
        payload: { bookId: currentBook.id, page: targetPage },
      });
      
      setIsDragging(false);
      setTempPage(targetPage);
    },
  });

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

      <TouchableOpacity 
        style={styles.contentArea}
        onPress={handleContentPress}
        activeOpacity={1}
      >
        <ScrollView
          key={`scroll-${settings.fontSize}-${renderKey}`}
          ref={scrollViewRef}
          style={styles.textContainer}
          contentContainerStyle={styles.textContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          scrollEnabled={false}
        >
          {renderText()}
        </ScrollView>
      </TouchableOpacity>

      <View style={styles.bottomBar}>
        <View style={styles.audioPlayerContainer}>
          {/* Time and Progress Bar */}
          <View style={styles.timeProgressContainer} key={`time-${settings.speechRate}`}>
            <View style={styles.timeLabels}>
              <Text style={styles.timeText}>
                {formatTime(getElapsedTime())}
              </Text>
              <Text style={styles.timeText}>
                {formatTime(getTotalTime())}
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
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: isDragging 
                        ? `${(tempPage / currentBook.totalPages) * 100}%`
                        : `${(currentBook.currentPage / currentBook.totalPages) * 100}%`
                    }
                  ]} 
                />
                <View 
                  style={[
                    styles.progressThumb,
                    { 
                      left: isDragging 
                        ? `${(tempPage / currentBook.totalPages) * 100}%`
                        : `${(currentBook.currentPage / currentBook.totalPages) * 100}%`
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
                // Rewind 15 seconds worth of content
                const wordsPerMinute = calculateWordsPerMinute(settings.speechRate);
                const wordsPerSecond = wordsPerMinute / 60;
                const wordsToRewind = wordsPerSecond * 15;
                // Approximate page rewind based on average words per page
                const pagesToRewind = Math.max(1, Math.round(wordsToRewind / 200));
                const newPage = Math.max(1, currentBook.currentPage - pagesToRewind);
                dispatch({
                  type: 'UPDATE_CURRENT_PAGE',
                  payload: { bookId: currentBook.id, page: newPage },
                });
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
                // Forward 15 seconds worth of content
                const wordsPerMinute = calculateWordsPerMinute(settings.speechRate);
                const wordsPerSecond = wordsPerMinute / 60;
                const wordsToForward = wordsPerSecond * 15;
                const pagesToForward = Math.max(1, Math.round(wordsToForward / 200));
                const newPage = Math.min(currentBook.totalPages, currentBook.currentPage + pagesToForward);
                dispatch({
                  type: 'UPDATE_CURRENT_PAGE',
                  payload: { bookId: currentBook.id, page: newPage },
                });
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
              currentBook.chapters.map((chapter, index) => (
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
                  This book doesn't have recognizable chapter markers
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
              Duration: {getTotalDuration(settings.speechRate)}
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
                <Text style={styles.wpmText}>{getWordsPerMinute(settings.speechRate)} words per minute</Text>
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
    paddingVertical: 8,
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