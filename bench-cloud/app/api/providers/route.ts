import { NextResponse } from "next/server";

export async function GET() {
  const providers = [
    { id: "anthropic", label: "Claude", enabled: !!process.env.ANTHROPIC_API_KEY },
    { id: "openai", label: "GPT", enabled: !!process.env.OPENAI_API_KEY },
    { id: "deepseek", label: "DeepSeek", enabled: !!process.env.DEEPSEEK_API_KEY },
    { id: "kimi", label: "Kimi", enabled: !!process.env.MOONSHOT_API_KEY },
    { id: "ollama", label: "Ollama Cloud", enabled: !!process.env.OLLAMA_CLOUD_URL },
  ];
  return NextResponse.json({ providers });
}
