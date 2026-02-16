# continuous_learning.py
import os
import json
import time
import openai

LOG_DIR = './logs'
FINE_TUNE_FILE = './fine_tune.jsonl'
SLEEP_INTERVAL = 3600  # 1 hour

openai.api_key = os.getenv('OPENAI_API_KEY')

def collect_logs():
    examples = []
    for filename in os.listdir(LOG_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(LOG_DIR, filename)
            with open(filepath, 'r') as f:
                data = json.load(f)
                prompt = data.get('prompt')
                response = data.get('response')
                feedback = data.get('feedback', 'none')

                if prompt and response:
                    examples.append({
                        'prompt': prompt,
                        'completion': response,
                        'metadata': {'feedback': feedback}
                    })
    return examples

def write_fine_tune_file(examples):
    with open(FINE_TUNE_FILE, 'a') as f:
        for ex in examples:
            json_line = json.dumps({'prompt': ex['prompt'], 'completion': ex['completion']})
            f.write(json_line + '\n')

def trigger_fine_tune():
    print('[LEARNER] Triggering fine-tune job...')
    # Example: Adjust model + dataset ID as needed
    response = openai.FineTune.create(
        training_file='file_id_placeholder',
        model='davinci'
    )
    print('[LEARNER] Fine-tune job started:', response)

def main():
    print('[LEARNER] Continuous learning loop started.')
    while True:
        examples = collect_logs()
        if examples:
            print(f'[LEARNER] Collected {len(examples)} new examples.')
            write_fine_tune_file(examples)
            # trigger_fine_tune()  # Uncomment when ready
        else:
            print('[LEARNER] No new examples found.')
        time.sleep(SLEEP_INTERVAL)

if __name__ == '__main__':
    main()
