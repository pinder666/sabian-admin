const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function transcribeAudio(audioFile, transcriptFile) {
  const transcriptDir = path.dirname(transcriptFile);
  if (!fs.existsSync(transcriptDir)) {
    fs.mkdirSync(transcriptDir, { recursive: true });
  }

  const command = `whisper "${audioFile}" --model medium --output_dir "${transcriptDir}" --output_format txt`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`[TRANSCRIBER] Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`[TRANSCRIBER] Stderr: ${stderr}`);
      return;
    }
    console.log(`[TRANSCRIBER] Transcription complete: ${transcriptFile}`);
  });
}

module.exports = { transcribeAudio };
