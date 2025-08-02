import * as FileSystem from 'expo-file-system';

// Utility to create sample TXT content for testing
export const createSampleTxtFile = async (): Promise<string> => {
  const sampleContent = `AI Reading Assistant - Sample Book (Extended Version)

This is an extended sample text file created for testing the AI Reading Assistant app. This version has been significantly expanded to demonstrate proper multi-page pagination functionality.

Chapter 1: Introduction to AI-Powered Reading

This chapter introduces the concept of reading with AI assistance. The text-to-speech functionality allows users to listen to books while doing other activities, making reading more accessible and convenient for everyone.

The pagination system divides long texts into manageable pages, making it easier to navigate through the content. Our intelligent algorithm considers various factors including content length, paragraph structure, and reading comfort to create optimal page breaks.

Modern digital reading experiences require sophisticated text processing capabilities. The AI Reading Assistant leverages advanced natural language processing techniques to understand text structure, detect language patterns, and optimize the reading experience for different types of content.

Chapter 2: Comprehensive Feature Overview

The app supports multiple file formats with specialized processing for each:
- TXT files (plain text): Best performance and compatibility, immediate loading
- EPUB files (e-books): Full metadata extraction, chapter navigation, advanced formatting support  
- PDF files (with conversion guide): Limited direct support, comprehensive conversion recommendations

Each format is processed differently to extract the text content and create a readable experience. The system automatically detects file encoding, handles various character sets, and processes content through our intelligent text optimization pipeline.

Our text-to-speech engine supports multiple languages and voices, allowing users to customize their audio experience. The speech synthesis technology adapts to different text types, properly handling punctuation, abbreviations, and specialized terminology.

Chapter 3: Advanced Navigation and User Experience

Users can navigate between pages using intuitive previous and next controls. The progress indicator shows the current position in the book with precise page numbers and percentage completion. Bookmark functionality allows readers to save important locations for quick access.

The audio controls allow users to play, pause, and navigate through the content using text-to-speech technology. Advanced features include variable speech rate, pitch adjustment, and automatic page advancement during audio playback.

The reading interface adapts to user preferences with customizable font sizes, background colors, and text colors. These accessibility features ensure comfortable reading for users with different visual needs and preferences.

Chapter 4: Technical Implementation and Architecture

Behind the scenes, the app uses sophisticated algorithms for text processing and pagination. The system analyzes content structure, identifies paragraph boundaries, and creates natural page breaks that respect the flow of information.

Language detection capabilities automatically identify English, Chinese, and mixed-language content, applying appropriate processing rules for each type. This ensures optimal reading experiences regardless of the source language or content complexity.

The pagination algorithm considers text density, screen size, and reading patterns to determine optimal page lengths. English text typically uses 1500 characters per page, while Chinese text uses 800 characters to account for higher information density.

Chapter 5: AI-Powered Features and Intelligence

The integrated AI assistant provides powerful text analysis capabilities. Users can select any passage to receive intelligent summaries, explanations, translations, or definitions. This feature transforms passive reading into an interactive learning experience.

Machine learning algorithms continuously improve the reading experience by analyzing user behavior, reading patterns, and content preferences. The system learns from user interactions to provide increasingly personalized recommendations and optimizations.

Chapter 6: Future Development and Innovation

As we continue to develop and refine the AI Reading Assistant, we're exploring exciting new features like real-time translation, voice-activated controls, and personalized reading recommendations based on user interests and reading patterns.

The future of digital reading includes advanced features like collaborative reading, social annotations, and intelligent content discovery. We're committed to making these cutting-edge capabilities accessible to all users.

This extended sample book demonstrates the app's ability to handle longer content with proper pagination, creating multiple pages for comfortable reading and navigation. Thank you for testing the AI Reading Assistant!`;

  const fileUri = FileSystem.documentDirectory + 'sample-book.txt';
  await FileSystem.writeAsStringAsync(fileUri, sampleContent);
  
  return fileUri;
};

export const createChineseSampleTxtFile = async (): Promise<string> => {
  const chineseSampleContent = `AI阅读助手 - 中文测试书籍（扩展版）

这是一本用于测试AI阅读助手应用程序的中文示例书籍。本书内容已被扩展，用于正确测试多页面分页系统的功能。

第一章：AI阅读技术简介

欢迎来到AI驱动的阅读世界！这个应用程序展示了现代技术如何增强您的阅读体验。人工智能技术的发展为数字阅读带来了革命性的变化，让阅读变得更加智能和个性化。

我们的系统采用先进的自然语言处理技术，能够理解文本内容的语义和结构，为用户提供最优化的阅读体验。无论您阅读的是小说、学术论文、新闻文章还是技术文档，系统都能智能适应。

现代数字阅读体验需要复杂的文本处理能力。AI阅读助手利用最新的机器学习算法来理解文本结构，检测语言模式，并为不同类型的内容优化阅读体验。

第二章：核心功能详解

AI阅读助手提供几个关键功能：文本转语音功能让您可以通过听觉来获取信息，特别适合在通勤、运动或者眼部需要休息时使用。AI驱动的文本分析功能可以为您提供内容摘要、关键词提取和智能问答。

可定制的阅读设置允许您根据个人喜好调整字体大小、背景颜色、语音速度等参数。书签和高亮支持让您可以标记重要内容，建立个人知识库。

我们的语音合成引擎支持多种语音和语调，让用户可以个性化他们的音频体验。语音合成技术能够适应不同的文本类型，正确处理标点符号、缩写和专业术语。

第三章：智能分页系统

文本转语音功能可以让您在做其他事情的同时听书。这对于多任务处理和视觉疲劳时非常有用。我们的分页算法特别针对中文文本进行了优化，考虑到中文文字的密度和阅读习惯。

对于中文内容，我们通常使用800字符每页的设置，确保在移动设备上获得最佳的阅读体验。系统会智能识别段落边界、标点符号和章节结构，创建自然的翻页点。

高级导航功能包括直观的上一页和下一页控制。进度指示器显示在书中的当前位置，包括精确的页码和完成百分比。书签功能允许读者保存重要位置以便快速访问。

第四章：用户体验设计

我们深入研究了中文用户的阅读习惯和偏好，设计了符合中文阅读特点的界面布局。从字体选择到行间距设置，每一个细节都经过精心考虑。

应用支持繁体中文、简体中文以及中英文混合内容的智能处理。语音合成技术支持标准普通话发音，让您享受纯正的中文朗读体验。

阅读界面根据用户偏好适应，具有可定制的字体大小、背景颜色和文本颜色。这些无障碍功能确保具有不同视觉需求和偏好的用户都能舒适阅读。

第五章：技术实现原理

在技术层面，我们使用了最新的机器学习算法来处理中文文本的复杂性。中文文本处理相比英文更加复杂，涉及词汇切分、语义理解和上下文分析等多个方面。

我们的文本处理管道包括编码检测、语言识别、智能分页和内容优化等步骤。这些处理过程在后台无缝进行，让您可以专注于阅读内容本身。

语言检测功能自动识别中文、英文和混合语言内容，为每种类型应用适当的处理规则。这确保了无论源语言或内容复杂性如何，都能获得最佳的阅读体验。

第六章：未来发展方向

随着技术的不断进步，我们正在探索更多激动人心的功能，包括实时翻译、语音交互控制、基于个人兴趣的智能推荐系统等。

我们致力于让先进的AI阅读技术惠及每一位用户，让阅读变得更加智能、便捷和有趣。感谢您选择AI阅读助手，让我们一起开启智能阅读的新时代。

数字阅读的未来包括协作阅读、社交注释和智能内容发现等高级功能。我们致力于让所有用户都能使用这些前沿功能。

这个扩展版的中文示例书籍应该能够创建多个页面，正确演示分页系统的功能。感谢您测试AI阅读助手！`;

  const fileUri = FileSystem.documentDirectory + 'chinese-sample-book.txt';
  
  await FileSystem.writeAsStringAsync(fileUri, chineseSampleContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  
  return fileUri;
};

// Utility to log book data for debugging
export const logBookData = (book: any, label: string = 'Book') => {
  console.log(`${label} Debug Info:`, {
    id: book.id,
    title: book.title,
    contentLength: book.content?.length || 0,
    pagesCount: book.pages?.length || 0,
    currentPage: book.currentPage,
    totalPages: book.totalPages,
    firstPagePreview: book.pages?.[0]?.content?.substring(0, 100) + '...',
  });
};