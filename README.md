[![Contributing](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](/CONTRIBUTING.md)[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)](#)[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](/LICENSE)

<p align="center">
  <img src="https://github.com/nadinev6/Vision8/blob/afeb0723136b6373fe9ce5bd682d4f06e1d0931a/VISION%208.png" alt="Vision 8 Logo" width="250">
</p>


<p align="center">
  <a href="https://react.dev/" target="_blank"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com/" target="_blank"><img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://deepmind.google/technologies/gemini/" target="_blank"><img src="https://img.shields.io/badge/Google_Gemini-8E44AD?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Google Gemini"></a>
  <a href="https://fastapi.tiangolo.com/" target="_blank"><img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="https://www.elastic.co/elasticsearch/" target="_blank"><img src="https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch&logoColor=white" alt="Elasticsearch"></a>
  <a href="https://redis.io/" target="_blank"><img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"></a>
</p>

## Table of Contents

  - [🚀 About Vision 8](#about-vision-8)
    - [🎯 Video-to-Video Generation](#video-to-video-generation)
  - [✨ Key Features](#key-features)
  - [🏗️ Architecture](#️-architecture)
  - [💻 Technology Stack](#-technology-stack)
  - [🛠️ Getting Started](#️-getting-started)
    - [Prerequisites](#prerequisites)
    - [Backend Setup](#backend-setup)
    - [Frontend Setup](#frontend-setup)
  - [🤝 Contributing](#-contributing)
  - [📄 License](#-license)


## 🚀 About Vision 8

Vision 8 is a cutting-edge workbench for deep, synchronous video analysis. It leverages Google's Gemini API to deconstruct video content into structured, actionable data: scenes, transcripts, and objects and provides a context-rich, conversational interface for exploration.

### 🎯 Video-to-Video Generation

Vision 8 is engineered as a foundational platform for high-fidelity video-to-video generation. The ultimate aim is to empower users to make minor, targeted changes to a reference video (e.g., swapping an object, changing a sign's text, adjusting lighting) and instantly generate a new, synthesized video of production quality, all while maintaining the original content's integrity and fidelity.

## ✨ Key Features

-   **🤖 AI-Powered Video Analysis**: Utilizes `gemini-2.5-flash` for fast, comprehensive video deconstruction into scenes, transcripts, and tracked objects.
-   **💬 Conversational Intelligence (RAG)**: An integrated chat interface provides intelligent, grounded answers using a Retrieval-Augmented Generation (RAG) pipeline powered by a FastAPI backend, Elasticsearch for vector search, and Gemini Function Calling.
-   **🔄 Synchronized Playback**: Clicking any inline citation in the chat automatically navigates the video player to the exact moment referenced, creating a seamless link between conversation, data, and playback.
-   **🖥️ Advanced UI/UX**: Features a fully resizable layout, a dual-player setup for comparison, and frame-accurate playback controls.

## 🏗️ Architecture

Vision 8 is a full-stack application with a React frontend and a Python (FastAPI) backend.

1.  **Video Ingestion**: The user uploads a video through the client. The frontend extracts representative frames and sends them to the backend.
2.  **AI Deconstruction**: The backend's `metadata_generator` service uses the Gemini API to analyze the frames and generate structured metadata (scenes, descriptions, objects).
3.  **Vectorization & Indexing**: The `elastic_service` generates vector embeddings for the textual metadata and ingests the complete document into an Elasticsearch index. Vector embeddings are cached in Redis by the `cache_service` to reduce latency and cost.
4.  **Conversational RAG**: When the user asks a question, the frontend calls the backend's `/chat` endpoint. The `conversation_handler` orchestrates the RAG pipeline:
    *   It generates a vector for the user's query.
    *   It performs a semantic search against Elasticsearch to retrieve relevant video segments.
    *   It passes the retrieved context and the original query to the Gemini model to generate a grounded, accurate answer.
    *   The structured response is returned to the frontend for display.

## 💻 Technology Stack

| Component | Technology / Role |
| :--- | :--- |
| **Frontend** | React, TypeScript, Tailwind CSS, Vite |
| **Backend** | Python, FastAPI, Uvicorn |
| **AI/LLM** | Google Gemini API (`gemini-2.5-flash`, `text-embedding-004`) |
| **Database** | Elasticsearch (Vector Search, Metadata Storage) |
| **Cache** | Redis (Vector Embedding Cache) |
| **Deployment** | Designed for serverless environments like Google Cloud Run |

## 🛠️ Getting Started

This project consists of a React frontend and a FastAPI backend.

### Prerequisites

-   Node.js and npm/yarn
-   Python 3.9+ and pip
-   Access to an Elasticsearch cluster
-   Access to a Redis instance
-   A Google Gemini API Key

### Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd vision8-backend
    ```

2.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Configure environment variables:**
    Create a `.env` file by copying the example and fill in your credentials.
    ```bash
    cp .env.example .env
    ```
    -   `ELASTIC_URL`, `ELASTIC_API_KEY`, `ELASTIC_INDEX`
    -   `GEMINI_API_KEY`
    -   `REDIS_URL`, `REDIS_API`

4.  **Run the backend server:**
    The server will start on `http://localhost:8000`.
    ```bash
    uvicorn src.main:app --reload
    ```

### Frontend Setup

1.  **Navigate to the root project directory:**
    ```bash
    cd .. 
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

3.  **Set up your Gemini API Key:**
    Create a `.env` file in the root directory and add your Gemini API key. This is used for the initial client-side analysis.
    ```
    GEMINI_API_KEY=your_google_gemini_api_key
    ```

4.  **Run the frontend development server:**
    The application will be available at `http://localhost:3000`.
    ```bash
    npm run dev
    ```

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE.txt` for more information. (Note: `LICENSE.txt` file not provided in this project).
