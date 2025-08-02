# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native application built with Expo for an AI reading assistant. The project uses TypeScript and follows the standard Expo project structure.

## Development Commands

- `npm start` - Start the Expo development server
- `npm run android` - Start the app on Android device/emulator
- `npm run ios` - Start the app on iOS device/simulator  
- `npm run web` - Start the app in web browser

## Project Structure

- `App.tsx` - Main application component with basic placeholder content
- `index.ts` - Entry point that registers the root component with Expo
- `app.json` - Expo configuration with app metadata, icons, and platform settings
- `tsconfig.json` - TypeScript configuration extending Expo's base config with strict mode
- `assets/` - Contains app icons, splash screen, and favicon

## Key Architecture Details

- Built on Expo SDK ~53.0.20 with React Native 0.79.5 and React 19.0.0
- Uses the new React Native architecture (newArchEnabled: true)
- Configured for cross-platform deployment (iOS, Android, Web)
- TypeScript with strict mode enabled
- Full-featured AI Reading Assistant with TTS, AI integration, and multi-format support

## File Format Support

The app supports importing books in multiple formats:
- **TXT**: Plain text files with automatic encoding detection
  - Best format for text-to-speech performance
  - No conversion needed, loads instantly
- **EPUB**: E-book format with full metadata and content parsing
  - Supports EPUB 2.0 and 3.0 formats
  - Extracts title, author, and content in reading order
  - HTML tag stripping for clean text output
- **PDF**: Limited support due to React Native/Expo constraints
  - Shows helpful conversion guide when PDF is selected
  - Recommends converting to TXT or EPUB for full functionality
  - PDF parsing libraries require native modules not available in Expo

File parsing is handled by the `FileParser` service in `src/services/fileParser.ts`

## PDF Conversion Recommendations
For PDF files, users should convert to:
1. **TXT format** using Google Docs, online converters, or desktop tools
2. **EPUB format** using calibre or similar e-book management software