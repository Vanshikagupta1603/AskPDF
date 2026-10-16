const chunkText = (text, chunkSize = 1000, overlap = 200) => {

    const chunks = [];

    let start = 0;

    while (start < text.length) {

        const end = Math.min(
            start + chunkSize,
            text.length
        );

        const chunk = text.slice(start, end).trim();

        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        start += chunkSize - overlap;
    }

    return chunks;
};

module.exports = chunkText;