[![Contributing](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](#contributing)[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)](#)[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](/LICENSE.txt)

<p align="center">
  <img src="https://github.com/nadinev6/Vision8/blob/afeb0723136b6373fe9ce5bd682d4f06e1d0931a/VISION%208.png" alt="Vision 8 Logo" width="250">
</p>

<p align="center">
  <a href="https://react.dev/" target="_blank"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com/" target="_blank"><img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://deepmind.google/technologies/gemini/" target="_blank"><img src="https://img.shields.io/badge/Google_Gemini-8E44AD?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Google Gemini"></a>
  <a href="https://fastapi.tiangolo.com/" target="_blank"><img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"></a>
</p>

## 🌐 Live Demo

**[https://vision8-e7683.web.app](https://vision8-e7683.web.app)**

Experience Vision8's AI video analysis capabilities with our interactive demo.

---

## 🚀 About Vision8

Vision8 is a cutting-edge AI-powered video analysis platform that transforms how you interact with video content. Upload any video and get instant AI-powered breakdowns, accurate transcriptions, and intelligent search capabilities.

### 🎯 Core Mission

Democratize video intelligence by making advanced AI video analysis accessible to creators, educators, and businesses worldwide.

## ✨ Key Features

- **🤖 AI-Powered Video Analysis**: Comprehensive video deconstruction using Google Gemini Flash
- **🎙️ Audio Transcription**: Accurate speech-to-text with speaker identification and timestamps
- **💬 Conversational Intelligence**: Ask questions about your video content and get precise answers
- **🔍 Intelligent Search**: Find specific scenes, dialogue, or objects instantly
- **🎨 AI Video Generation**: Replace scenes with AI-generated content (coming soon)
- **🔄 Synchronized Playback**: Click any citation to jump to the exact moment in your video

## 🏗️ Architecture

Vision8 combines a modern React frontend with a powerful Python backend:

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: FastAPI + Python
- **AI**: Google Gemini Flash (multimodal video + audio analysis)
- **Search**: Supabase PostgreSQL with pgvector (vector-based semantic search)
- **Storage**: Firebase for user data and video storage
- **Database**: Supabase (cost-effective alternative to Elasticsearch)

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+
- Gemini API key

### Quick Setup
```bash
# Clone the repository
git clone https://github.com/nadinev6/Vision8.git
cd Vision8

# Install dependencies
npm install

# Set up environment variables
cp .env.local.template .env
# Add your VITE_GEMINI_API_KEY

# Start development server
npm run dev
```

### Deploy
```bash
# Build for production
npm run build

# Deploy to Firebase (if configured)
firebase deploy --only hosting
```

## 🎯 Use Cases

- **Content Creators**: Analyze and enhance video content for better engagement
- **Educators**: Search and organize educational materials with AI precision
- **Businesses**: Process training videos and extract actionable insights
- **Researchers**: Analyze video data with advanced AI capabilities

## 🔧 Recent Updates

- ✅ **Infrastructure Migration**: Migrated from Elasticsearch to Supabase (80% cost reduction)
- ✅ **Vector Search**: Implemented pgvector-based semantic search in Supabase
- ✅ **Cost Optimization**: Eliminated $50-200+/month cloud costs
- ✅ **Multimodal AI Integration**: 95% reduction in processing costs
- ✅ **Real Audio Transcription**: Accurate speech-to-text from video audio
- ✅ **Responsive Design**: Optimized for desktop and mobile devices
- ✅ **Performance Optimization**: Faster analysis and improved user experience

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. **Fork the Project**
2. **Create your Feature Branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your Changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the Branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🔗 Links

- **🌐 Live Demo**: [https://vision8-e7683.web.app](https://vision8-e7683.web.app)
- **📧 Contact**: [nadine@techie.com](mailto:nadine@techie.com)
- **🐛 Issues**: [GitHub Issues](https://github.com/nadinev6/Vision8/issues)

## 🙏 Acknowledgments

- **Supabase** for cost-effective vector database and real-time capabilities
- **Google Gemini** for powerful multimodal AI capabilities
- **React & Vite** for excellent development experience
- **Tailwind CSS** for beautiful, responsive design
- **FastAPI** for robust backend framework

---

<p align="center">
  <strong>Vision8</strong> - Transforming video content with AI, one frame at a time. 🎬✨
</p>