import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '../types';

interface AIAssistantProps {
  selectedText: string;
  book: Book;
  onClose: () => void;
}

export default function AIAssistant({
  selectedText,
  book,
  onClose,
}: AIAssistantProps) {
  const [activeTab, setActiveTab] = useState<'summarize' | 'translate' | 'define'>('summarize');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [customText, setCustomText] = useState('');

  const textToProcess = selectedText || customText;

  const handleSummarize = async () => {
    if (!textToProcess.trim()) {
      Alert.alert('Error', 'Please select text or enter text to summarize');
      return;
    }

    setLoading(true);
    try {
      // Simulate AI API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock summarization result
      setResult(`Summary: This text discusses ${textToProcess.length > 100 ? 'various topics and ideas presented in a comprehensive manner' : 'key concepts that are relevant to the main theme'}. The main points include important information that helps readers understand the context and significance of the content.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!textToProcess.trim()) {
      Alert.alert('Error', 'Please select text or enter text to translate');
      return;
    }

    setLoading(true);
    try {
      // Simulate translation API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock translation result
      setResult(`Translation (Spanish): [Translated version of the selected text would appear here. This is a placeholder for the actual translation service.]`);
    } catch (error) {
      Alert.alert('Error', 'Failed to translate text');
    } finally {
      setLoading(false);
    }
  };

  const handleDefine = async () => {
    if (!textToProcess.trim()) {
      Alert.alert('Error', 'Please select text or enter a word to define');
      return;
    }

    setLoading(true);
    try {
      // Simulate definition API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock definition result
      const word = textToProcess.trim().split(' ')[0];
      setResult(`Definition of \"${word}\": [Dictionary definition would appear here with pronunciation, part of speech, and multiple meanings if applicable.]`);
    } catch (error) {
      Alert.alert('Error', 'Failed to get definition');
    } finally {
      setLoading(false);
    }
  };

  const TabButton = ({ 
    tab, 
    title, 
    icon 
  }: { 
    tab: 'summarize' | 'translate' | 'define'; 
    title: string; 
    icon: keyof typeof Ionicons.glyphMap; 
  }) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.activeTab]}
      onPress={() => {
        setActiveTab(tab);
        setResult('');
      }}
    >
      <Ionicons 
        name={icon} 
        size={20} 
        color={activeTab === tab ? '#007AFF' : '#666'} 
      />
      <Text style={[
        styles.tabText, 
        activeTab === tab && styles.activeTabText
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const handleAction = () => {
    switch (activeTab) {
      case 'summarize':
        handleSummarize();
        break;
      case 'translate':
        handleTranslate();
        break;
      case 'define':
        handleDefine();
        break;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Assistant</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TabButton tab="summarize" title="Summarize" icon="document-text-outline" />
        <TabButton tab="translate" title="Translate" icon="language-outline" />
        <TabButton tab="define" title="Define" icon="book-outline" />
      </View>

      <ScrollView style={styles.content}>
        {selectedText ? (
          <View style={styles.selectedTextContainer}>
            <Text style={styles.selectedTextLabel}>Selected Text:</Text>
            <Text style={styles.selectedText}>{selectedText}</Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Enter text:</Text>
            <TextInput
              style={styles.textInput}
              value={customText}
              onChangeText={setCustomText}
              placeholder={`Enter text to ${activeTab}...`}
              multiline
              textAlignVertical="top"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionButton, loading && styles.disabledButton]}
          onPress={handleAction}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.actionButtonText}>
              {activeTab === 'summarize' ? 'Generate Summary' :
               activeTab === 'translate' ? 'Translate Text' :
               'Get Definition'}
            </Text>
          )}
        </TouchableOpacity>

        {result ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultLabel}>Result:</Text>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        ) : null}
      </ScrollView>
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
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  selectedTextContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  selectedTextLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  selectedText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  inputContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  textInput: {
    height: 100,
    fontSize: 16,
    color: '#333',
    textAlignVertical: 'top',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
});