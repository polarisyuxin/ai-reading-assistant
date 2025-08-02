import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useAppContext } from '../context/AppContext';
import { clearAllData, debugStoredData } from '../utils/debugUtils';
import { createSampleTxtFile, createChineseSampleTxtFile } from '../utils/testUtils';
import { FileParser } from '../services/fileParser';
import { Book } from '../types';

export default function SettingsScreen() {
  const { state, dispatch } = useAppContext();
  const { settings } = state;

  const updateSetting = (key: string, value: any) => {
    // If font size is changing, trigger repagination
    if (key === 'fontSize' && value !== settings.fontSize) {
      console.log('🔄 Font size changed, triggering repagination...', {
        oldSize: settings.fontSize,
        newSize: value
      });
      
      // Update settings first
      dispatch({
        type: 'UPDATE_SETTINGS',
        payload: { [key]: value },
      });
      
      // Then repaginate all books with new font size
      dispatch({
        type: 'REPAGINATE_BOOKS',
        payload: { fontSize: value },
      });
    } else {
      // Normal setting update
      dispatch({
        type: 'UPDATE_SETTINGS',
        payload: { [key]: value },
      });
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will remove all books and reset settings. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            // Reset app state
            dispatch({ type: 'LOAD_DATA', payload: { books: [], settings: {
              speechRate: 1.0,
              speechPitch: 1.0,
              speechLanguage: 'en-US',
              fontSize: 16,
              backgroundColor: '#ffffff',
              textColor: '#000000',
              autoBookmark: true,
            } } });
            Alert.alert('Success', 'All data cleared');
          },
        },
      ]
    );
  };

  const handleDebugData = async () => {
    await debugStoredData();
    Alert.alert('Debug', 'Check console for stored data details');
  };

  const handleCreateSampleBook = async () => {
    try {
      const sampleFileUri = await createSampleTxtFile();
      const parsedBook = await FileParser.parseFile(sampleFileUri, 'sample-book.txt', settings.fontSize);
      
      const newBook: Book = {
        id: Date.now().toString(),
        title: 'Sample Test Book',
        author: 'AI Reading Assistant',
        content: parsedBook.content,
        pages: parsedBook.pages,
        currentPosition: 0,
        currentPage: 1,
        totalLength: parsedBook.content.length,
        totalPages: parsedBook.pages.length,
        dateAdded: new Date(),
        bookmarks: [],
        highlights: [],
      };

      dispatch({ type: 'ADD_BOOK', payload: newBook });
      Alert.alert('Success', `Sample book created!\n${newBook.totalPages} pages • ${newBook.totalLength} characters`);
    } catch (error) {
      console.error('Failed to create sample book:', error);
      Alert.alert('Error', 'Failed to create sample book');
    }
  };

  const handleCreateChineseSampleBook = async () => {
    try {
      const sampleFileUri = await createChineseSampleTxtFile();
      const parsedBook = await FileParser.parseFile(sampleFileUri, 'chinese-sample-book.txt', settings.fontSize);
      
      const newBook: Book = {
        id: Date.now().toString(),
        title: 'AI阅读助手 - 中文测试书籍',
        author: 'AI Reading Assistant',
        content: parsedBook.content,
        pages: parsedBook.pages,
        currentPosition: 0,
        currentPage: 1,
        totalLength: parsedBook.content.length,
        totalPages: parsedBook.pages.length,
        dateAdded: new Date(),
        bookmarks: [],
        highlights: [],
      };

      dispatch({ type: 'ADD_BOOK', payload: newBook });
      Alert.alert('成功', `中文示例书籍已创建！\n${newBook.totalPages} 页 • ${newBook.totalLength} 字符`);
    } catch (error) {
      console.error('Failed to create Chinese sample book:', error);
      Alert.alert('Error', 'Failed to create Chinese sample book');
    }
  };

  const SettingRow = ({ 
    title, 
    subtitle, 
    children 
  }: { 
    title: string; 
    subtitle?: string; 
    children: React.ReactNode; 
  }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Audio Settings</Text>
        
        <SettingRow 
          title="Speech Rate" 
          subtitle={`${settings.speechRate.toFixed(1)}x`}
        >
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={2.0}
            step={0.1}
            value={settings.speechRate}
            onValueChange={(value) => updateSetting('speechRate', value)}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#E0E0E0"
          />
        </SettingRow>

        <SettingRow 
          title="Speech Pitch" 
          subtitle={`${settings.speechPitch.toFixed(1)}`}
        >
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={2.0}
            step={0.1}
            value={settings.speechPitch}
            onValueChange={(value) => updateSetting('speechPitch', value)}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#E0E0E0"
          />
        </SettingRow>

        <SettingRow 
          title="Speech Language" 
          subtitle={settings.speechLanguage === 'zh-CN' ? 'Chinese (Simplified)' : 
                   settings.speechLanguage === 'zh-TW' ? 'Chinese (Traditional)' : 
                   'English'}
        >
          <View style={styles.languageOptions}>
            {[
              { code: 'en-US', label: 'EN' },
              { code: 'zh-CN', label: '简' },
              { code: 'zh-TW', label: '繁' }
            ].map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageOption,
                  settings.speechLanguage === lang.code && styles.selectedLanguage,
                ]}
                onPress={() => updateSetting('speechLanguage', lang.code)}
              >
                <Text style={[
                  styles.languageText,
                  settings.speechLanguage === lang.code && styles.selectedLanguageText
                ]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Display</Text>
        
        <SettingRow 
          title="Font Size" 
          subtitle={`${settings.fontSize}pt`}
        >
          <Slider
            style={styles.slider}
            minimumValue={12}
            maximumValue={24}
            step={1}
            value={settings.fontSize}
            onValueChange={(value) => updateSetting('fontSize', value)}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#E0E0E0"
          />
        </SettingRow>

        <SettingRow title="Background Color">
          <View style={styles.colorOptions}>
            {['#ffffff', '#f8f9fa', '#2c2c2e', '#1c1c1e'].map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  settings.backgroundColor === color && styles.selectedColor,
                ]}
                onPress={() => {
                  updateSetting('backgroundColor', color);
                  updateSetting('textColor', color === '#ffffff' || color === '#f8f9fa' ? '#000000' : '#ffffff');
                }}
              />
            ))}
          </View>
        </SettingRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Behavior</Text>
        
        <SettingRow 
          title="Auto Bookmark" 
          subtitle="Automatically save reading position"
        >
          <Switch
            value={settings.autoBookmark}
            onValueChange={(value) => updateSetting('autoBookmark', value)}
            trackColor={{ false: '#E0E0E0', true: '#007AFF' }}
            thumbColor="white"
          />
        </SettingRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        
        <TouchableOpacity style={styles.aboutRow}>
          <Text style={styles.aboutText}>AI Reading Assistant</Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.aboutRow}>
          <Text style={styles.aboutText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.aboutRow}>
          <Text style={styles.aboutText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug</Text>
        
        <TouchableOpacity style={styles.aboutRow} onPress={handleCreateSampleBook}>
          <Text style={styles.aboutText}>Create Sample Book (EN)</Text>
          <Ionicons name="document-text" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.aboutRow} onPress={handleCreateChineseSampleBook}>
          <Text style={styles.aboutText}>创建中文示例书籍 (中文)</Text>
          <Ionicons name="language" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.aboutRow} onPress={handleDebugData}>
          <Text style={styles.aboutText}>Debug Stored Data</Text>
          <Ionicons name="bug" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.aboutRow} onPress={handleClearData}>
          <Text style={[styles.aboutText, { color: '#ff3b30' }]}>Clear All Data</Text>
          <Ionicons name="trash" size={20} color="#ff3b30" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  section: {
    marginTop: 20,
    backgroundColor: 'white',
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#333',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  slider: {
    width: 120,
    height: 40,
  },
  colorOptions: {
    flexDirection: 'row',
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedColor: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  languageOptions: {
    flexDirection: 'row',
  },
  languageOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#f8f9fa',
  },
  selectedLanguage: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  languageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  selectedLanguageText: {
    color: 'white',
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  aboutText: {
    fontSize: 16,
    color: '#333',
  },
  versionText: {
    fontSize: 16,
    color: '#666',
  },
});