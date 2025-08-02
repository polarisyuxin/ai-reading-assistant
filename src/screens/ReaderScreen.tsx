import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useAppContext } from '../context/AppContext';
import AudioControls from '../components/AudioControls';
import AIAssistant from '../components/AIAssistant';
import { detectPrimaryLanguage } from '../utils/textUtils';

export default function ReaderScreen() {
  const { state, dispatch } = useAppContext();
  const { currentBook, settings, isPlaying } = state;
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const [lastBookId, setLastBookId] = useState<string | null>(null);

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

  // Debug settings changes
  useEffect(() => {
    console.log('🎨 Settings changed in Reader:', {
      fontSize: settings.fontSize,
      textColor: settings.textColor,
      backgroundColor: settings.backgroundColor
    });
  }, [settings.fontSize, settings.textColor, settings.backgroundColor]);

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
      pitch: settings.speechPitch,
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
      <View style={styles.emptyContainer}>
        <Ionicons name="book-outline" size={80} color="#ccc" />
        <Text style={styles.emptyText}>No book selected</Text>
        <Text style={styles.emptySubtext}>
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
      return (
        <Text style={[
          styles.bookText, 
          { 
            color: settings.textColor, 
            fontSize: settings.fontSize,
            lineHeight: settings.fontSize * 1.75
          }
        ]}>
          No content available
        </Text>
      );
    }

    const currentPage = getCurrentPage();
    if (!currentPage) {
      console.log('renderText: No current page available');
      return (
        <Text style={[
          styles.bookText, 
          { 
            color: settings.textColor, 
            fontSize: settings.fontSize,
            lineHeight: settings.fontSize * 1.75
          }
        ]}>
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
    
    const textStyle = {
      color: settings.textColor, 
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * 1.75
    };
    
    return (
      <View>
        <Text style={[styles.bookText, textStyle]}>
          {currentPage.content}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: settings.backgroundColor }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
          {currentBook.author && (
            <Text style={styles.bookAuthor} numberOfLines={1}>
              by {currentBook.author}
            </Text>
          )}
          <Text style={styles.bookInfo}>
            Page {currentBook.currentPage} of {currentBook.totalPages} • {currentBook.content?.length || 0} characters
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={renderFirstPage} style={styles.actionButton}>
            <Ionicons name="document-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={addBookmark} style={styles.actionButton}>
            <Ionicons name="bookmark-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAIModal(true)}
            style={styles.actionButton}
          >
            <Ionicons name="sparkles" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.textContainer}
        contentContainerStyle={styles.textContent}
      >
        {renderText()}
      </ScrollView>

      <AudioControls
        isPlaying={isPlaying}
        onPlay={startReading}
        onStop={stopReading}
        book={currentBook}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  bookInfo: {
    fontSize: 12,
    color: '#999',
  },
  headerActions: {
    flexDirection: 'row',
  },
  actionButton: {
    marginLeft: 16,
  },
  textContainer: {
    flex: 1,
  },
  textContent: {
    padding: 20,
  },
  bookText: {
    textAlign: 'justify',
  },
  currentText: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
});