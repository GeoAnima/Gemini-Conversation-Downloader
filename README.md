# Gemini Conversation Downloader

A UserScript to download shared Google Gemini conversations (`gemini.google.com/share/*`) as JSON or PDF.

## Installation

1.  Ensure you have a UserScript manager like [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://www.greasespot.net/) installed in your browser.
2.  Click the "Raw" button on the [script's GitHub page](https://github.com/GeoAnima/Gemini-Conversation-Downloader/raw/main/gemini-conversation-downloader.user.js) (or navigate to the `.user.js` file in the repository and click "Raw") to install the script automatically via your UserScript manager. *Note: Update the URL if your filename or repository structure differs.*

## Usage

Once installed, navigate to a public Gemini share link (e.g., `https://gemini.google.com/share/...`). The script adds two icon buttons (document icon for JSON, download icon for PDF) in the header area, next to the native "Copy link" and "Report" buttons. Click these buttons to download the current conversation in the respective format.

## Features

* Downloads conversations as a structured JSON file (including title, URL, and messages).
* Downloads conversations as a formatted PDF document.
* Uses Turndown and Marked to attempt faithful rendering of Markdown/HTML content in the PDF.

## Dependencies

This script relies on the following external libraries, loaded automatically via `@require`:

* [Marked.js](https://cdn.jsdelivr.net/npm/marked@4.0.0/lib/marked.min.js) (for Markdown parsing)
* [PDFKit](https://cdn.jsdelivr.net/npm/pdfkit@0.16.0/js/pdfkit.standalone.js) (for PDF generation)
* [Blob Stream](https://cdn.jsdelivr.net/npm/blob-stream@0.1.3/.js) (for handling blobs in PDF generation)
* [Turndown](https://unpkg.com/turndown/dist/turndown.js) (for converting Gemini's HTML response to Markdown for PDF rendering)

## Limitations & Disclaimer

* **Subject to Breakage:** This script relies on the specific HTML structure (CSS Selectors) of Gemini's shared conversation pages. Google frequently updates its web interfaces. **Any changes by Google to Gemini's page structure will likely break this script.** Updates to the script (specifically the selectors) will be required periodically to keep it working. Use the browser's Developer Console to check for errors if the script stops working.
* **PDF Rendering:** While the script tries to render formatting accurately using Turndown, Marked, and PDFKit, perfectly replicating complex web formatting (like intricate tables or inline styles) in a PDF is challenging. Content accuracy is prioritized, but visual fidelity may vary.
* **Dynamic Content:** This script is designed for the static shared pages (`gemini.google.com/share/*`). It will not work on the main interactive Gemini chat interface.

## License

This script is published under the MIT License.
