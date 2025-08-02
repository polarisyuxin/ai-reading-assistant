import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { Book } from '../types';
import { FileParser } from '../services/fileParser';
import { getFirstNWords, countWords, detectPrimaryLanguage } from '../utils/textUtils';

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useAppContext();
  const { settings } = state;

  const pickDocument = async () => {
    try {
      console.log('📁 Opening document picker on platform:', Platform.OS);
      
      const pickerOptions: DocumentPicker.DocumentPickerOptions = {
        type: [
          'text/plain', // .txt files
          'text/*', // All text files
          'application/pdf', // .pdf files
          'application/epub+zip', // .epub files
          '*/*', // Allow all files as fallback
        ],
        copyToCacheDirectory: Platform.OS !== 'web', // Don't copy on web
        multiple: false,
      };
      
      const result = await DocumentPicker.getDocumentAsync(pickerOptions);

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Show loading state
        Alert.alert('Processing', 'Parsing your book...', [], { cancelable: false });
        
        try {
          console.log('LibraryScreen: Parsing file:', asset.name, 'URI:', asset.uri);
          console.log('LibraryScreen: Using font size for pagination:', settings.fontSize);
          const parsedBook = await FileParser.parseFile(asset.uri, asset.name, settings.fontSize);
          
          console.log('LibraryScreen: Parsed book:', {
            title: parsedBook.title,
            contentLength: parsedBook.content.length,
            pagesCount: parsedBook.pages.length,
            firstPageContent: parsedBook.pages[0]?.content.substring(0, 100)
          });
          
          // Validate parsed content
          if (!parsedBook.content || parsedBook.content.trim().length === 0) {
            throw new Error('No readable content found in the file');
          }
          
          const newBook: Book = {
            id: Date.now().toString(),
            title: parsedBook.title || 'Untitled',
            author: parsedBook.author,
            content: parsedBook.content.trim(),
            pages: parsedBook.pages,
            currentPosition: 0,
            currentPage: 1,
            totalLength: parsedBook.content.trim().length,
            totalPages: parsedBook.pages.length,
            dateAdded: new Date(),
            bookmarks: [],
            highlights: [],
          };

          console.log('LibraryScreen: Created book object:', {
            id: newBook.id,
            title: newBook.title,
            contentLength: newBook.content.length,
            totalPages: newBook.totalPages,
            currentPage: newBook.currentPage
          });

          dispatch({ type: 'ADD_BOOK', payload: newBook });
          Alert.alert('Success', `Book "${newBook.title}" added to library!\n${newBook.totalPages} pages • ${newBook.totalLength} characters`);
        } catch (parseError) {
          console.error('Parse error:', parseError);
          Alert.alert(
            'Error', 
            `Failed to parse the selected file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
          );
        }
      }
    } catch (error) {
      console.error('Document picker error:', error);
      Alert.alert('Error', 'Failed to select document');
    }
  };

  const selectBook = (book: Book) => {
    // Smart extraction of first 30 words/characters for Chinese/mixed content
    const first30Words = getFirstNWords(book.content, 30);
    const wordCount = countWords(book.content);
    const language = detectPrimaryLanguage(book.content);
    
    console.log('📖 Book clicked - First 30 words/characters:', first30Words);
    console.log('📊 Book details:', {
      title: book.title,
      author: book.author,
      language: language,
      totalWords: wordCount.words,
      totalCharacters: wordCount.characters,
      chineseCharacters: wordCount.chineseChars,
      totalPages: book.totalPages
    });
    
    dispatch({ type: 'SELECT_BOOK', payload: book });
    // Navigate to Reader tab
    navigation.navigate('Reader' as never);
  };

  const deleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'DELETE_BOOK', payload: book.id });
            Alert.alert('Deleted', `"${book.title}" has been removed from your library.`);
          },
        },
      ]
    );
  };

  const renderBookItem = ({ item }: { item: Book }) => (
    <View style={styles.bookItem}>
      <TouchableOpacity
        style={styles.bookContent}
        onPress={() => selectBook(item)}
      >
        <View style={styles.bookIcon}>
          <Ionicons name="book" size={40} color="#007AFF" />
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle}>{item.title}</Text>
          {item.author && <Text style={styles.bookAuthor}>{item.author}</Text>}
          <Text style={styles.bookProgress}>
            Progress: {Math.round((item.currentPosition / item.totalLength) * 100)}%
          </Text>
          <Text style={styles.bookDate}>
            Added: {item.dateAdded.toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteBook(item)}
      >
        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Library</Text>
        <TouchableOpacity style={styles.addButton} onPress={pickDocument}>
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {state.books.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="library-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No books in your library</Text>
          <Text style={styles.emptySubtext}>
            Tap the + button to add your first book{'\n'}
            Supports TXT and EPUB formats{'\n'}
            (PDF files show conversion guide)
          </Text>
        </View>
      ) : (
        <FlatList
          data={state.books}
          renderItem={renderBookItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  listContainer: {
    padding: 16,
  },
  bookItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'center',
  },
  bookContent: {
    flexDirection: 'row',
    flex: 1,
  },
  bookIcon: {
    marginRight: 16,
    justifyContent: 'center',
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bookProgress: {
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 2,
  },
  bookDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 12,
  },
});