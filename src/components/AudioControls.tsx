import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '../types';
import { useAppContext } from '../context/AppContext';

interface AudioControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  book: Book;
}

export default function AudioControls({
  isPlaying,
  onPlay,
  onStop,
  book,
}: AudioControlsProps) {
  const { dispatch } = useAppContext();

  const previousPage = () => {
    if (book.currentPage > 1) {
      dispatch({
        type: 'UPDATE_CURRENT_PAGE',
        payload: { bookId: book.id, page: book.currentPage - 1 },
      });
    }
  };

  const nextPage = () => {
    if (book.currentPage < book.totalPages) {
      dispatch({
        type: 'UPDATE_CURRENT_PAGE',
        payload: { bookId: book.id, page: book.currentPage + 1 },
      });
    }
  };

  const progressPercentage = (book.currentPage / book.totalPages) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progressPercentage}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {book.currentPage}/{book.totalPages}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity 
          onPress={previousPage} 
          style={[styles.controlButton, book.currentPage <= 1 && styles.disabledButton]}
          disabled={book.currentPage <= 1}
        >
          <Ionicons name="chevron-back" size={24} color={book.currentPage <= 1 ? "#ccc" : "#007AFF"} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={isPlaying ? onStop : onPlay}
          style={styles.playButton}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={32}
            color="white"
          />
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={nextPage} 
          style={[styles.controlButton, book.currentPage >= book.totalPages && styles.disabledButton]}
          disabled={book.currentPage >= book.totalPages}
        >
          <Ionicons name="chevron-forward" size={24} color={book.currentPage >= book.totalPages ? "#ccc" : "#007AFF"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    minWidth: 40,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 20,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
});