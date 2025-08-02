import AsyncStorage from '@react-native-async-storage/async-storage';

// Debug utility to clear all stored data
export const clearAllData = async () => {
  try {
    await AsyncStorage.multiRemove(['books', 'settings']);
    console.log('All stored data cleared');
  } catch (error) {
    console.error('Failed to clear data:', error);
  }
};

// Debug utility to check stored data
export const debugStoredData = async () => {
  try {
    const books = await AsyncStorage.getItem('books');
    const settings = await AsyncStorage.getItem('settings');
    
    console.log('Stored books:', books);
    console.log('Stored settings:', settings);
    
    if (books) {
      const parsedBooks = JSON.parse(books);
      console.log('Parsed books count:', parsedBooks.length);
      parsedBooks.forEach((book: any, index: number) => {
        console.log(`Book ${index}:`, {
          id: book.id,
          title: book.title,
          contentLength: book.content?.length || 'undefined',
          hasContent: !!book.content,
        });
      });
    }
  } catch (error) {
    console.error('Failed to debug stored data:', error);
  }
};