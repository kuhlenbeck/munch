import Anthropic from '@anthropic-ai/sdk';
import { saveEntry, FoodEntry } from './database';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are Munch, a friendly and enthusiastic food journal assistant for kids and families. Your job is to help people log what they ate in a fun, encouraging way.

GOAL: Collect these details and then save them using the save_food_entry tool:
1. Person's name
2. What they ate or drank (be inclusive — all foods and drinks count)
3. Type of meal: breakfast, lunch, dinner, or snack
4. When they ate (morning, noon, afternoon, evening, or a specific time like "around 12:30")

RULES:
- Keep ALL responses SHORT — 1 to 2 sentences maximum
- Ask ONE question at a time
- Be warm, fun, and encouraging 🎉
- Use simple language kids can understand
- If they mention multiple foods at once, that's great! Capture them all in one entry
- Once you have all 4 pieces of info, IMMEDIATELY call the save_food_entry tool — don't ask for confirmation first
- After saving, say something encouraging and ask if they'd like to log anything else
- If they say they're done or say goodbye, respond with a cheerful goodbye

EXAMPLES:
User: "I had pizza"
You: "Yum, pizza! 🍕 Was that breakfast, lunch, dinner, or a snack?"

User: "lunch"
You: "Nice! What time did you eat your pizza lunch?"

User: "around noon"
You: [calls save_food_entry tool immediately]
After tool call: "Logged it! 🎉 Want to add anything else you ate today?"

IMPORTANT: Never ask for more information than needed. If they volunteer it upfront, skip those questions.`;

const SAVE_TOOL: Anthropic.Tool = {
  name: 'save_food_entry',
  description: 'Save a food journal entry once all information has been collected',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "The person's name",
      },
      food: {
        type: 'string',
        description: 'What they ate or drank, described naturally',
      },
      meal: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Type of meal',
      },
      time_of_day: {
        type: 'string',
        description: 'When they ate, e.g. "around noon", "7pm", "morning"',
      },
      notes: {
        type: 'string',
        description: 'Any additional details worth noting (optional)',
      },
    },
    required: ['name', 'food', 'meal', 'time_of_day'],
  },
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSession {
  messages: Anthropic.MessageParam[];
  knownName?: string;
}

const sessions = new Map<string, ChatSession>();
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Periodically clean up old sessions
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions.entries()) {
    const lastMsg = (session as ChatSession & { lastActivity?: number }).lastActivity;
    if (lastMsg && lastMsg < cutoff) {
      sessions.delete(id);
    }
  }
}, 60 * 1000);

export function getOrCreateSession(sessionId: string): ChatSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  const session = sessions.get(sessionId)!;
  (session as ChatSession & { lastActivity?: number }).lastActivity = Date.now();
  return session;
}

export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export async function chat(sessionId: string, userMessage: string): Promise<{
  reply: string;
  saved?: FoodEntry;
  sessionEnded?: boolean;
}> {
  const session = getOrCreateSession(sessionId);
  (session as ChatSession & { lastActivity?: number }).lastActivity = Date.now();

  // Build the user message, injecting name context if we know it
  let messageContent = userMessage;
  if (session.knownName && session.messages.length === 0) {
    messageContent = `[Returning user: ${session.knownName}] ${userMessage}`;
  }

  session.messages.push({ role: 'user', content: messageContent });

  let savedEntry: FoodEntry | undefined;
  let finalReply = '';
  let continueLoop = true;

  while (continueLoop) {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [SAVE_TOOL],
      messages: session.messages,
    });

    // Collect text content
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    // Check for tool use
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
      // Append the assistant message with all blocks
      session.messages.push({ role: 'assistant', content: response.content });

      // Process each tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.name === 'save_food_entry') {
          const input = toolUse.input as {
            name: string;
            food: string;
            meal: string;
            time_of_day: string;
            notes?: string;
          };

          savedEntry = saveEntry(input);

          if (input.name) {
            session.knownName = input.name;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Entry saved successfully! ID: ${savedEntry.id}`,
          });
        }
      }

      // Add tool results and continue the loop
      session.messages.push({ role: 'user', content: toolResults });
    } else {
      // No tool use — final response
      finalReply = textBlocks;
      session.messages.push({ role: 'assistant', content: finalReply });
      continueLoop = false;
    }
  }

  // Detect if session should end (user said bye, done, etc.)
  const sessionEnded = /\b(bye|goodbye|done|that'?s all|see ya|later)\b/i.test(userMessage);
  if (sessionEnded) {
    // Keep the session for a bit so they can see the goodbye, then clean up
    setTimeout(() => resetSession(sessionId), 30_000);
  }

  return { reply: finalReply, saved: savedEntry, sessionEnded };
}
