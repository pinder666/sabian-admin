// sabian_speak.js
import fetch from 'node-fetch';
import fs from 'fs';
import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config(); // Load .env

// CONFIG
const API_KEY = process.env.ELEVENLABS_API_KEY; // from .env
const VOICE_ID = process.env.SABIAN_VOICE_ID;
; // from .env

async function speak(text) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
    const headers = {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY
    };
    const body = JSON.stringify({
        text: text,
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    });

    if (!response.ok) {
        console.error('❌ Error fetching voice:', await response.text());
        return;
    }

    const buffer = await response.buffer();
    fs.writeFileSync('sabian_voice_response.mp3', buffer);

    exec('start sabian_voice_response.mp3'); // Play on Windows
}

speak(process.argv[2]);
