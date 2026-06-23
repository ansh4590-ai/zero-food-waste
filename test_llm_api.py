from openai import OpenAI
import sys

def test_api():
    try:
        client = OpenAI(
            base_url="http://localhost:3001/v1",
            api_key="freellmapi-2ee66a5d6d569eeafaa3e346c0e8ba1a1061dcbb1f519296",
        )

        print("Testing connection to local LLM API at http://localhost:3001/v1...")
        
        response = client.chat.completions.create(
            model="auto",
            messages=[{"role": "user", "content": "Hello! Please respond with a short confirmation message if you receive this."}],
        )
        
        print("\n[SUCCESS] Received response:")
        print("-" * 40)
        print(response.choices[0].message.content)
        print("-" * 40)
        
    except Exception as e:
        print(f"\n[ERROR] Error connecting to API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_api()
