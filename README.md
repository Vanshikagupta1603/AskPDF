\# AskPDF — AI-Powered PDF Question Answering



AskPDF is a document question-answering application that lets users upload PDF files and ask questions about their content. It uses Retrieval-Augmented Generation (RAG) to retrieve relevant document chunks and generate context-aware answers.



\## Features



\- Upload PDF documents

\- Process PDFs asynchronously using a background worker

\- Split extracted text into overlapping chunks

\- Generate embeddings for semantic search

\- Retrieve relevant document chunks using vector search

\- Ask questions about uploaded documents

\- Stream responses to the frontend

\- Track document processing status

\- Validate requests and apply API rate limits



\## Tech Stack



\*\*Backend\*\*

\- Node.js

\- Express.js

\- MongoDB Atlas

\- Redis

\- Google Gemini API

\- PDF parsing and text chunking



\*\*Frontend\*\*

\- Python

\- Streamlit



\*\*Core concepts\*\*

\- Retrieval-Augmented Generation (RAG)

\- Text embeddings

\- Vector similarity search

\- Asynchronous job processing

\- Server-Sent Events (SSE)



\## Architecture



1\. The user uploads a PDF through the Streamlit frontend.

2\. The backend validates the file and creates a processing job.

3\. A background worker extracts text and splits it into chunks.

4\. Gemini generates embeddings for the chunks.

5\. The chunks and embeddings are stored in MongoDB.

6\. When a user asks a question, the backend retrieves relevant chunks using vector search.

7\. Gemini generates an answer based on the retrieved context.

8\. The frontend displays the answer and relevant sources.



\## Project Structure



```text

AskPDF/

├── backend/

│   ├── src/

│   │   ├── config/

│   │   ├── models/

│   │   ├── routes/

│   │   ├── services/

│   │   ├── worker/

│   │   └── server.js

│   ├── package.json

│   └── package-lock.json

├── frontend/

│   └── app.py

├── .gitignore

└── README.md

```



\## Prerequisites



\- Node.js and npm

\- Python

\- MongoDB Atlas configured for vector search

\- Redis

\- A Google Gemini API key



\## Local Setup



\### 1. Clone the repository



```bash

git clone https://github.com/Vanshikagupta1603/AskPDF.git

cd AskPDF

```



\### 2. Set up the backend



```bash

cd backend

npm install

```



Create a `.env` file inside `backend/` and configure the environment variables required by the application, including your MongoDB connection, Redis connection, and Gemini API key.



\*\*Never commit your `.env` file or expose API keys.\*\*



\### 3. Start the backend API



In the `backend/` directory, run:



```bash

npm run dev

```



\### 4. Start the background worker



Open a separate terminal:



```bash

cd D:\\AskPDF\\backend

npm run worker

```



\### 5. Set up the frontend



Open another terminal:



```bash

cd D:\\AskPDF\\frontend

python -m venv venv

```



Activate the environment on Windows:



```powershell

.\\venv\\Scripts\\Activate.ps1

```



Install the Python dependencies required by the frontend, then run:



```bash

streamlit run app.py

```



\## Environment Variables



Configure the required variables in `backend/.env` according to the application's configuration files. Never put real credentials in this README.



\## Current Status



The project has been developed and tested locally. Deployment and production configuration may require additional setup.



\## Author



\*\*Vanshika Gupta\*\*



GitHub: \[Vanshikagupta1603](https://github.com/Vanshikagupta1603)



