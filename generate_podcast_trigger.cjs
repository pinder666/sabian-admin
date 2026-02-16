require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');

const supabaseUrl = 'https://nmjrfwsprbumvflcmjwf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tanJmd3NwcmJ1bXZmbGNtandmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTcyODIzNywiZXhwIjoyMDY1MzA0MjM3fQ._tNN1krg8tHI8iIs1wbGb-FUxqyNt1aI40dTIDNdbfE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function generatePodcastTrigger(mode, userId) {
    const validModes = ['conversational', 'boardroom', 'insight'];
    if (!validModes.includes(mode)) {
        console.error(`Invalid mode: ${mode}`);
        return;
    }

    // Mock business data for testing — remove later if needed
    const data = {
        business_name: "TestCo",
        industry: "AI",
        founder: "The Creator"
    };

    let command;
  switch (mode) {
    case 'conversational':
      command = `node conversational_podcast.cjs "${JSON.stringify(data).replace(/"/g, '\\"')}"`;
  
        break;
    case 'boardroom':
       command = `node boardroom_podcast.cjs "${JSON.stringify(data).replace(/"/g, '\\"')}"`;

        break;
    case 'insight':
        command = `node insight_engine_beginners.cjs "${JSON.stringify(data).replace(/"/g, '\\"')}"`;
        break;
}



    console.log(`Executing command: ${command}`); // stays for debug

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error executing ${mode} script:`, err);
            return;
        }
        console.log(`Output:\n${stdout}`);
        if (stderr) console.error(`Stderr:\n${stderr}`);
    });
}

// TEMP call for test — remove when API triggers this
generatePodcastTrigger('conversational', 'dummy');
