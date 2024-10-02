import json
import subprocess
import time

def read_json_file(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

def curl_request(url):
    try:
        # Using GET request instead of HEAD, and following redirects
        result = subprocess.run(['curl', '-s', '-S', '-L', '-o', '/dev/null', '-w', '%{http_code}', url], capture_output=True, text=True)
        status_code = result.stdout.strip()
        return f"Status Code: {status_code}"
    except subprocess.CalledProcessError as e:
        return f"Curl Error: {e.stderr.strip()}"
    except Exception as e:
        return f"Error: {str(e)}"

def main():
    json_file = 'file_paths.json'
    urls = read_json_file(json_file)
    
    print(f"Found {len(urls)} URLs in {json_file}")
    print("Starting requests...\n")
    
    for i, url in enumerate(urls, 1):
        print(f"Request {i}/{len(urls)}: {url}")
        status = curl_request(url)
        print(f"Response: {status}\n")
        
        # Add a small delay to avoid overwhelming the server
        time.sleep(1)
    
    print("All requests completed.")

if __name__ == "__main__":
    main()