---
"@foxychat/app": patch
---

# Add Speech-to-Text Support

This release introduces comprehensive speech-to-text functionality to FoxyChat, enabling users to input messages using voice recognition powered by Google Cloud Speech API.

## 🎤 New Features

### Voice Input Integration

- **Real-time speech recognition** with live transcription display
- **Visual recording indicator** with animated red pulsing microphone button
- **Smart text merging** that appends speech to existing chat input
- **Auto-stop functionality** after configurable silence timeout (5-8 seconds)

### User Experience Enhancements

- **One-click voice activation** via microphone button in chat input
- **Toast notifications** for recording status and completion feedback
- **State-aware UI** with different mic icons (Mic/MicOff) based on recording state
- **Seamless editor integration** with real-time text insertion

### Technical Implementation

- **WebSocket integration** for real-time transcription updates
- **Session management** with proper cleanup and error handling
- **Authentication integration** with better-auth system
- **Multi-language support** with configurable language codes
- **Robust error handling** with user-friendly error messages

## 🔧 Technical Changes

### New Dependencies

- `@google-cloud/speech@^7.1.0` - Google Cloud Speech API integration
- `node-record-lpcm16@^1.0.1` - Audio recording capabilities
- `bufferutil@^4.0.9` & `utf-8-validate@^6.0.5` - WebSocket optimizations
- Updated `dotenv` to v17.0.0

### New Components & Hooks

- **`use-speech-to-text.ts`** - 489-line comprehensive speech recognition hook
- Enhanced chat input components with speech state management
- Extended editor with `insertContent()` and `isFocused()` methods
- Integrated speech state into global chat context

### Enhanced Features

- **Real-time transcript updates** in chat editor
- **Configurable speech settings** (language, timeout, encoding)
- **Session state persistence** across component re-renders
- **Automatic silence detection** with customizable timeout
- **WebSocket connection management** with reconnection handling

## 🛡️ Security & Authentication

- Requires user authentication for speech service access
- Session-based API requests with credential management
- Secure WebSocket connections with authentication validation

## 🌐 Configuration Options

- **Language support**: Configurable language codes (default: en-US)
- **Audio settings**: Sample rate (16kHz), LINEAR16 encoding
- **Timeout settings**: Customizable silence detection (5-8 seconds)
- **Service health checks** for backend speech service availability

This implementation provides a professional-grade speech-to-text experience that seamlessly integrates with the existing chat interface while maintaining security and performance standards.
