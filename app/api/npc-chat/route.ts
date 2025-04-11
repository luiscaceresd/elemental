import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    // Add system message to make the AI act like a game NPC
    system: `You are a wise guide NPC in an elemental-themed game world based on Avatar: The Last Airbender. 
    Your character is mysterious and knowledgeable about the elements (water, fire, earth, air) and the game world.
    Keep responses concise (under 100 words) and conversational, as if speaking directly to the player.
    Occasionally mention elemental powers, bending abilities, or provide hints about gameplay.
    Be friendly but somewhat enigmatic. Never break character or reference that you're an AI.`,
  });

  return result.toDataStreamResponse();
} 