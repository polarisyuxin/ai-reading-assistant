import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book, ReadingSettings } from '../types';
import { repaginateAllBooks, needsRepagination } from '../utils/repagination';

interface AppState {
  books: Book[];
  currentBook: Book | null;
  settings: ReadingSettings;
  isPlaying: boolean;
}

type AppAction =
  | { type: 'ADD_BOOK'; payload: Book }
  | { type: 'DELETE_BOOK'; payload: string }
  | { type: 'SELECT_BOOK'; payload: Book }
  | { type: 'UPDATE_READING_POSITION'; payload: { bookId: string; position: number } }
  | { type: 'UPDATE_CURRENT_PAGE'; payload: { bookId: string; page: number } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<ReadingSettings> }
  | { type: 'REPAGINATE_BOOKS'; payload: { fontSize: number } }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'ADD_BOOKMARK'; payload: { bookId: string; bookmark: any } }
  | { type: 'LOAD_DATA'; payload: { books: Book[]; settings: ReadingSettings } };

const initialState: AppState = {
  books: [],
  currentBook: null,
  settings: {
    speechRate: 1.0,
    speechPitch: 1.0,
    speechLanguage: 'en-US', // Default to English, will auto-detect from text
    fontSize: 16,
    backgroundColor: '#ffffff',
    textColor: '#000000',
    autoBookmark: true,
  },
  isPlaying: false,
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_BOOK':
      return {
        ...state,
        books: [...state.books, action.payload],
      };
    case 'DELETE_BOOK':
      const filteredBooks = state.books.filter(book => book.id !== action.payload);
      const currentBookAfterDelete = state.currentBook?.id === action.payload ? null : state.currentBook;
      return {
        ...state,
        books: filteredBooks,
        currentBook: currentBookAfterDelete,
      };
    case 'SELECT_BOOK':
      return {
        ...state,
        currentBook: action.payload,
      };
    case 'UPDATE_READING_POSITION':
      const updatedBooks = state.books.map(book =>
        book.id === action.payload.bookId
          ? { ...book, currentPosition: action.payload.position }
          : book
      );
      const updatedCurrentBook = state.currentBook?.id === action.payload.bookId
        ? { ...state.currentBook, currentPosition: action.payload.position }
        : state.currentBook;
      return {
        ...state,
        books: updatedBooks,
        currentBook: updatedCurrentBook,
      };
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    case 'REPAGINATE_BOOKS':
      const repaginatedBooks = repaginateAllBooks(state.books, action.payload.fontSize);
      const repaginatedCurrentBook = state.currentBook 
        ? repaginatedBooks.find(book => book.id === state.currentBook!.id) || state.currentBook
        : state.currentBook;
      return {
        ...state,
        books: repaginatedBooks,
        currentBook: repaginatedCurrentBook,
      };
    case 'SET_PLAYING':
      return {
        ...state,
        isPlaying: action.payload,
      };
    case 'UPDATE_CURRENT_PAGE':
      const updatedBooksForPage = state.books.map(book =>
        book.id === action.payload.bookId
          ? { ...book, currentPage: action.payload.page }
          : book
      );
      const updatedCurrentBookForPage = state.currentBook?.id === action.payload.bookId
        ? { ...state.currentBook, currentPage: action.payload.page }
        : state.currentBook;
      return {
        ...state,
        books: updatedBooksForPage,
        currentBook: updatedCurrentBookForPage,
      };
    case 'LOAD_DATA':
      return {
        ...state,
        books: action.payload.books,
        settings: action.payload.settings,
      };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load data on app start
  useEffect(() => {
    loadData();
  }, []);

  // Save data when state changes
  useEffect(() => {
    saveData();
  }, [state.books, state.settings]);

  const loadData = async () => {
    try {
      const booksData = await AsyncStorage.getItem('books');
      const settingsData = await AsyncStorage.getItem('settings');
      
      const books = booksData ? JSON.parse(booksData) : [];
      const settings = settingsData ? JSON.parse(settingsData) : initialState.settings;
      
      // Validate and convert date strings back to Date objects
      const validBooks = books.filter((book: any) => {
        // Ensure essential properties exist
        if (!book.id || !book.title || book.content === undefined) {
          console.warn('Invalid book data found, skipping:', book);
          return false;
        }
        return true;
      }).map((book: Book) => {
        // Ensure all required properties have default values
        return {
          ...book,
          content: book.content || '',
          pages: book.pages || [{ pageNumber: 1, content: book.content || '', startPosition: 0, endPosition: (book.content?.length || 1) - 1 }],
          currentPosition: book.currentPosition || 0,
          currentPage: book.currentPage || 1,
          totalLength: book.totalLength || (book.content?.length || 0),
          totalPages: book.totalPages || (book.pages?.length || 1),
          dateAdded: new Date(book.dateAdded),
          dateLastRead: book.dateLastRead ? new Date(book.dateLastRead) : undefined,
          bookmarks: (book.bookmarks || []).map(bookmark => ({
            ...bookmark,
            dateCreated: new Date(bookmark.dateCreated),
          })),
          highlights: (book.highlights || []).map(highlight => ({
            ...highlight,
            dateCreated: new Date(highlight.dateCreated),
          })),
        };
      });
      
      dispatch({ type: 'LOAD_DATA', payload: { books: validBooks, settings } });
    } catch (error) {
      console.error('Failed to load data:', error);
      // If loading fails, ensure we have a clean state
      dispatch({ type: 'LOAD_DATA', payload: { books: [], settings: initialState.settings } });
    }
  };

  const saveData = async () => {
    try {
      // Only save if we have data (avoid saving empty state during initialization)
      if (state.books.length > 0 || state.settings !== initialState.settings) {
        await AsyncStorage.setItem('books', JSON.stringify(state.books));
        await AsyncStorage.setItem('settings', JSON.stringify(state.settings));
      }
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}