export interface BookPage {
  pageNumber: number;
  content: string;
  startPosition: number;
  endPosition: number;
}

export interface Chapter {
  id: string;
  title: string;
  startPage: number;
  endPage?: number;
  startPosition: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  content: string;
  pages: BookPage[];
  chapters: Chapter[];
  currentPosition: number;
  currentPage: number;
  totalLength: number;
  totalPages: number;
  dateAdded: Date;
  dateLastRead?: Date;
  bookmarks: Bookmark[];
  highlights: Highlight[];
}

export interface Bookmark {
  id: string;
  position: number;
  note?: string;
  dateCreated: Date;
}

export interface Highlight {
  id: string;
  startPosition: number;
  endPosition: number;
  text: string;
  note?: string;
  dateCreated: Date;
}

export interface ReadingSettings {
  speechRate: number;
  speechVoice?: string;
  speechLanguage: string; // Language code for TTS (e.g., 'zh-CN', 'en-US')
  fontSize: number;
  backgroundColor: string;
  textColor: string;
  autoBookmark: boolean;
}

export interface AIResponse {
  summary?: string;
  translation?: string;
  definition?: string;
}