import urllib.request
import json
import sys

def test_api():
    url = "http://localhost:3000/api/llm/chat/completions"
    data = {
        "model": "auto",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello! Please respond with a short confirmation message if you receive this."}
        ]
    }
    
    headers = {'Content-Type': 'application/json'}
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')

    print(f"Testing connection to {url} (Powered by Gemini)...")
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            print("\n[SUCCESS] Received response:")
            print("-" * 40)
            print(result['choices'][0]['message']['content'])
            print("-" * 40)
            
    except Exception as e:
        print(f"\n[ERROR] Error connecting to API: {e}")
        print("Make sure 'npm run dev' is running so the server on port 3000 is active.")
        sys.exit(1)

if __name__ == "__main__":
    test_api()
