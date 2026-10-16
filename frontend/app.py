import time
import json
import streamlit as st
import requests

BACKEND_URL = "http://localhost:5000"

st.set_page_config(
    page_title="AskPDF",
    page_icon="📄",
    layout="wide"
)

st.title("📄 AskPDF")
st.write("RAG-Powered Document Q&A System")

st.divider()

st.header("Upload your PDF")

uploaded_file = st.file_uploader(
    "Choose a PDF file",
    type=["pdf"]
)

if uploaded_file is not None:

    st.write("Selected file:", uploaded_file.name)

    if st.button("Upload PDF"):

        files = {
            "file": (
                uploaded_file.name,
                uploaded_file.getvalue(),
                "application/pdf"
            )
        }

        try:

            response = requests.post(
                f"{BACKEND_URL}/documents",
                files=files
            )

            if response.status_code == 202:

                data = response.json()

                st.success(
                    "PDF uploaded successfully!"
                )

                document_id = data["documentId"]
                job_id = data["jobId"]

                st.write(
                    "Document ID:",
                    document_id
                )

                st.write(
                    "Job ID:",
                    job_id
                )

                st.session_state["document_id"] = document_id
                st.session_state["job_id"] = job_id

            else:
                try:
                    error_data = response.json()
                    error_message = error_data.get(
                        "message",
                         response.text
                    )
                except ValueError:
                     error_message = response.text
                if response.status_code == 413:
                    st.error(
                          "File too large. Please upload a PDF "
                          "that is no larger than 20 MB."
                    )
                else:
                    st.error(
                       f"Upload failed ({response.status_code}): "
                       f"{error_message}"
                    )

        except requests.exceptions.RequestException as error:

            st.error(
                f"Could not connect to backend: {error}"
            )


if "job_id" in st.session_state:

    st.divider()

    st.header("📊 Document Processing")

    status_placeholder = st.empty()

    while True:

        try:

            response = requests.get(
                f"{BACKEND_URL}/jobs/{st.session_state['job_id']}"
            )

            if response.status_code != 200:

                status_placeholder.error(
                    f"Failed to get job status: {response.text}"
                )

                break

            job = response.json()

            status = job["status"]
            stage = job["stage"]
            progress = int(job["progress"])

            status_placeholder.write(
                f"Status: **{status}**"
            )

            st.progress(progress / 100)

            st.write(
                f"Stage: `{stage}`"
            )

            if status == "completed":

                status_placeholder.success(
                    "✅ PDF processing completed!"
                )

                break

            if status == "failed":

                status_placeholder.error(
                    f"❌ Processing failed: {job.get('error')}"
                )

                break

            time.sleep(2)

        except requests.exceptions.RequestException as error:

            status_placeholder.error(
                f"Could not connect to backend: {error}"
            )

            break
# if "document_id" in st.session_state:

#     st.divider()

#     st.header("💬 Ask Questions")

#     question = st.text_input(
#         "Ask a question about your PDF:"
#     )

#     if st.button("Ask"):

#         if not question.strip():

#             st.warning(
#                 "Please enter a question."
#             )

#         else:

#             payload = {
#                 "question": question,
#                 "documentId": st.session_state["document_id"]
#             }

#             try:

#                 response = requests.post(
#                     f"{BACKEND_URL}/chat",
#                     json=payload
#                 )

#                 if response.status_code == 200:

#                     data = response.json()

#                     st.subheader("Answer")

#                     st.write(
#                         data["answer"]
#                     )

#                     if data.get("sources"):

#                         st.subheader("Sources")

#                         for source in data["sources"]:

#                             st.write(
#                                 f"Chunk {source['chunkIndex']} "
#                                 f"| Score: {source['score']:.3f}"
#                             )

#                 else:

#                     st.error(
#                         f"Chat request failed: {response.text}"
#                     )

#             except requests.exceptions.RequestException as error:

#                 st.error(
#                     f"Could not connect to backend: {error}"
#                 )
if "document_id" in st.session_state:

    st.divider()

    st.header("💬 Ask Questions")

    question = st.text_input(
        "Ask a question about your PDF:"
    )

    if st.button("Ask"):

        if not question.strip():
            st.warning(
                "Please enter a question."
            )

        else:

            payload = {
                "question": question,
                "documentId": st.session_state["document_id"]
            }

            try:

                response = requests.post(
                    f"{BACKEND_URL}/chat/stream",
                    json=payload,
                    stream=True,
                    timeout=120
                )
                response.encoding = "utf-8"

                # Handle errors before streaming starts
                if response.status_code != 200:

                    try:
                        error_data = response.json()

                        st.error(
                            error_data.get(
                                "message",
                                "Chat request failed"
                            )
                        )

                    except Exception:

                        st.error(
                            f"Chat request failed: "
                            f"{response.text}"
                        )

                else:

                    st.subheader("Answer")

                    answer_placeholder = st.empty()

                    answer_text = ""

                    sources = []

                    # Read SSE stream line by line
                    for line in response.iter_lines(
                        decode_unicode=True
                    ):

                        if not line:
                            continue

                        # SSE messages start with "data: "
                        if line.startswith("data: "):

                            data = line[6:]

                            try:

                                event = json.loads(data)

                                event_type = event.get(
                                    "type"
                                )

                                # Sources received
                                if event_type == "sources":

                                    sources = event.get(
                                        "sources",
                                        []
                                    )

                                # Answer chunk received
                                elif event_type == "chunk":

                                    text = event.get(
                                        "text",
                                        ""
                                    )

                                    answer_text += text

                                    answer_placeholder.write(
                                        answer_text
                                    )

                                # Streaming completed
                                elif event_type == "done":

                                    break

                                # Backend sent an error
                                elif event_type == "error":

                                    st.error(
                                        event.get(
                                            "message",
                                            "Streaming error"
                                        )
                                    )

                                    break

                            except json.JSONDecodeError:

                                st.warning(
                                    "Received invalid "
                                    "stream data."
                                )

                    # Display sources after answer
                    if sources:

                        st.subheader("Retrieved Sources")
                        for source in sources:
                            with st.expander(
                                f"Chunk {source['chunkIndex']} "
                                f"| Score: {source['score']:.3f}"
                            ):
                               st.text(source.get("text", "Source text unavailable"))

            except requests.exceptions.RequestException as error:

                st.error(
                    f"Could not connect to backend: "
                    f"{error}"
                )