<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Zero Food Waste

A full-stack application connecting surplus food with those in need.

## Features
- **AI-Powered Food Classification**: Uses Google Gemini and Cloud Vision.
- **Secure KYC**: Integration with AWS Rekognition for facial matching.
- **Serverless Ready**: Configured for Vercel deployment.
- **Robust Database**: Powered by Supabase.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env.local` file by copying `.env.example` and fill in your credentials for:
   - Supabase
   - Google Gemini API (`GEMINI_API_KEY`)
   - AWS Rekognition
   - Firebase (if applicable)
3. Start the development server:
   `npm run dev`

## Deployment

The app is optimized for Vercel. Ensure you set all the environment variables from `.env.example` in your Vercel project settings.
