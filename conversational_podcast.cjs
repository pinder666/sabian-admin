const fs = require('fs');

const args = process.argv.slice(2);
if (!args[0]) {
    console.error("No business data provided.");
    process.exit(1);
}

const businessData = JSON.parse(args[0]);

const templatePath = fs.existsSync('./conversational_template.json')
  ? './conversational_template.json'
  : './sabian_prompts/conversational_template.json';



if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    process.exit(1);
}

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

const finalPrompt = {
    ...template,
    businessData
};

console.log("Final Conversational Podcast Prompt:\n", JSON.stringify(finalPrompt, null, 2));
