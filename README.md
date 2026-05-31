# 🛡️ CivicShield: Anti-Hoax Civic Alert Gateway

![Live Demo](https://img.shields.io/badge/Live_Demo-Available-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-Open_Source-blue?style=for-the-badge)

**Live Application:** [https://civicshield.pages.dev/](https://civicshield.pages.dev/)

**CivicShield** is a real-time, tamper-proof verification engine designed to combat digital misinformation and public panic during local civic emergencies (e.g., severe weather, flash floods, sudden traffic diversions, and public health advisories).

During crises, unofficial messaging groups often flood with forwarded misinformation, outdated photos, or fake alerts. CivicShield acts as a "single source of truth" by aggregating, cryptographically signing, and verifying official alerts from local municipal corporations, city police, and meteorological departments.

---

## ✨ Key Features

*   **Real-Time Verification Engine:** Citizens can paste any suspicious forwarded message into the portal. The semantic engine cross-references the text with verified alerts and immediately returns a confidence-scored verdict (Verified, Partially Matched, or Unverified).
*   **Cryptographic Tamper-Proofing:** Every official alert ingested by the system is instantly hashed using SHA-256 and timestamped, ensuring the data's integrity cannot be altered or poisoned.
*   **Live Official Feed:** A categorized, filterable dashboard of live alerts prioritized by severity (Critical, Warning, Info).
*   **Serverless-Ready Architecture:** Designed to run fully on the edge (e.g., Cloudflare Pages) with fallback local JavaScript verification and mock datasets for seamless demonstration without needing a deployed backend server.
*   **Analytics Dashboard:** Real-time metrics displaying hoaxes caught, total alerts verified, and categorical trends.

---

## 🛠️ Technology Stack

*   **Frontend:** Vanilla HTML, CSS, JavaScript
*   **Design:** Custom Design System (Formal Government Aesthetic), CSS Custom Properties, Fully Responsive, Dark Mode enabled.
*   **Backend (Optional):** Python, Flask, SQLite (API ready for deployment via Render/Heroku).
*   **Security:** SHA-256 Hashing, HMAC Timestamping.

---

## 🚀 Getting Started (Local Development)

If you'd like to run the full full-stack application (with the Python backend) on your local machine, follow these steps:

### Prerequisites
*   Python 3.8+ installed

### Installation & Execution

The application is built to run entirely on the frontend (Serverless mode) by default. To test it locally:

1. Clone the repository to your local machine.
2. Start a simple local HTTP server in the project directory (for example, using Python):
   ```cmd
   python -m http.server 8000
   ```
3. Open your browser to `http://localhost:8000` to interact with the application.

*Note: The `backend/` directory contains an optional Python Flask API if you choose to deploy a centralized server, but it is not required for the frontend to function.*

---

## 🌐 Deployment Architecture

The application has been explicitly decoupled to support modern edge-hosting:
*   **Frontend / Static Site:** Deployed to [Cloudflare Pages](https://pages.cloudflare.com/). When the application detects it is running on a production URL, it automatically disables local network requests and relies on its client-side verification engine to ensure users never experience security permission prompts.
*   **Backend API (Optional for Production):** The `backend` directory includes a `Procfile` and `gunicorn` configuration, making it a 1-click deploy to Render, Heroku, or PythonAnywhere if a centralized database is required.

---

## 🧪 Testing the Verification Engine

Test the semantic matching engine on the [Live Demo](https://civicshield.pages.dev/) by pasting these examples into the verify box:

*   ✅ **Verified Match:** *"Heavy flooding on Hoshangabad Road, all vehicles stuck"*
*   ⚠️ **Partial Match:** *"Dengue outbreak warning in Arera Colony area"*
*   ❌ **Hoax / No Match:** *"The government is shutting down all internet services in Bhopal starting tomorrow due to the riots."*

---

> *Built for public safety. Stop the hoax. Verify the truth.*
