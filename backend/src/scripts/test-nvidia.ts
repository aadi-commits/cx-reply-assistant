import 'dotenv/config';

const apiKey = process.env.NVIDIA_API_KEY?.trim();
const baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const model = process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b';

async function main(): Promise<void> {
  if (!apiKey) {
    console.error('NVIDIA_API_KEY is missing. Add it to backend/.env and retry.');
    process.exitCode = 1;
    return;
  }

  console.log('Testing NVIDIA NIM connection...');
  console.log(`Endpoint: ${baseUrl}/chat/completions`);
  console.log(`Model: ${model}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 80,
        messages: [
          { role: 'system', content: 'Reply briefly and clearly.' },
          { role: 'user', content: 'Say: NVIDIA API connection successful.' }
        ]
      }),
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 30000))
    });
  } catch (error) {
    console.error(`Could not reach NVIDIA API: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    console.error(`NVIDIA API returned HTTP ${response.status}: ${detail}`);
    console.error('Check your key, model ID, NVIDIA API access, and any rate limits.');
    process.exitCode = 1;
    return;
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.error('NVIDIA returned HTTP success, but no message content was found.');
    process.exitCode = 1;
    return;
  }

  console.log('\nSUCCESS - NVIDIA API key and model are working.');
  console.log(`Sample response: ${content.trim().slice(0, 300)}`);
}

void main();
