# Speech Pronunciation Helper

A web-based application that helps users practice and improve their pronunciation by providing real-time visual feedback on spoken words.

## 🎯 What is this?

Speech Pronunciation Helper is an interactive tool designed to assist language learners and anyone looking to improve their speech clarity. Users input text, then speak it aloud while the application listens and provides instant feedback on pronunciation accuracy.

## 🔧 How It Works

1. **Input Text**: Paste or type the text you want to practice in the sidebar textarea.
2. **Submit Text**: Click "Enter" to process the text and display individual words in the main view.
3. **Start Listening**: Click "Start Listening" to activate speech recognition.
4. **Speak**: Read the displayed text aloud.
5. **Get Feedback**: Words are highlighted in real-time:
   - ✅ **Green**: Correctly pronounced words
   - ❌ **Red**: Words that need improvement
6. **Review**: Check the "Latest Recognition" section to see what was recognized.

## 🛠️ Technologies

| Technology | Purpose |
|------------|---------|
| **HTML5** | Page structure and semantic markup |
| **CSS3** | Styling and responsive layout |
| **Vanilla JavaScript** | Application logic and interactivity |
| **Web Speech API** | Browser-native speech recognition |

## 📁 Project Structure

```
speech_pronunciation/
├── index.html    # Main HTML structure
├── styles.css    # Stylesheet for UI design
├── script.js     # JavaScript application logic
└── README.md     # Project documentation
```

## ✨ Features

- **Real-time Speech Recognition**: Uses the browser's built-in Web Speech API
- **Visual Pronunciation Feedback**: Color-coded word highlighting
- **Session Management**: Start/stop listening controls with status indicators
- **Text Management**: Easy input, clear, and reset functionality
- **Accessibility**: ARIA attributes for screen reader support
- **Responsive Design**: Works on various screen sizes

## 🌐 Browser Support

This application requires a browser that supports the Web Speech API:

- ✅ Google Chrome (recommended)
- ✅ Microsoft Edge
- ✅ Safari
- ⚠️ Firefox (limited support)

> **Note**: A microphone and permission to use it are required.

## 🚀 Getting Started

1. Clone or download this repository
2. Open `index.html` in a supported browser
3. Allow microphone access when prompted
4. Start practicing your pronunciation!

## 📝 Usage Tips

- Speak clearly and at a moderate pace
- Ensure you're in a quiet environment for best results
- Use shorter sentences for more accurate recognition
- Check the status indicator to confirm the app is listening

## ⚠️ Limitations

- Requires an internet connection (for most browsers' speech recognition)
- Accuracy depends on microphone quality and ambient noise
- Some accents or dialects may have varying recognition accuracy
- Not all browsers support the Web Speech API

## 📄 License

This project is open source and available for personal and educational use.
