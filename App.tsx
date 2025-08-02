import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import LibraryScreen from './src/screens/LibraryScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { AppProvider } from './src/context/AppContext';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName: keyof typeof Ionicons.glyphMap;

              if (route.name === 'Library') {
                iconName = focused ? 'library' : 'library-outline';
              } else if (route.name === 'Reader') {
                iconName = focused ? 'book' : 'book-outline';
              } else if (route.name === 'Settings') {
                iconName = focused ? 'settings' : 'settings-outline';
              } else {
                iconName = 'help-outline';
              }

              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#007AFF',
            tabBarInactiveTintColor: 'gray',
            headerStyle: {
              backgroundColor: '#f8f9fa',
            },
            headerTintColor: '#333',
          })}
        >
          <Tab.Screen name="Library" component={LibraryScreen} />
          <Tab.Screen name="Reader" component={ReaderScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </AppProvider>
  );
}
