import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY = 20;

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GROQ_API_KEY is not configured on the server.'), {
      status: 503,
    });
  }
  cachedClient = new Groq({ apiKey });
  return cachedClient;
}

/**
 * System prompt for "DigitechIO Sahayak" — the in-app assistant. Written in
 * Roman Urdu + English mix so the model mirrors the same tone back. The
 * `<action>` protocol is the only structured channel we trust: anything else
 * the model writes is rendered as plain chat text.
 */
function buildSystemPrompt({ userName, userRole, activeListName, activeListId }) {
  const safeName = userName || 'Bhai';
  const safeRole = userRole || 'employee';
  const listLine = activeListId
    ? `User abhi "${activeListName || 'unnamed list'}" list pe hai (id: ${activeListId}). Default target yahi hai.`
    : 'User ne abhi koi list select nahi ki — agar task banana ho to user se list specify karwana.';

  return `You are "DigitechIO Sahayak", ek friendly Pakistani office-colleague style AI assistant jo DigitechIO project management app ke andar embedded hai.

TONE:
- Hamesha Roman Urdu + English mix me reply karo, jaise ek Pakistani colleague baat karta hai. Example: "Bhai task bana diya hai", "Theek hai yaar", "Jaldi se step follow karo".
- Short, helpful, no bullshit. Markdown formatting allowed (bold, lists) but emojis sparingly use karo.

PRODUCT KNOWLEDGE:
DigitechIO ek team project management tool hai. Yeh features hain:
1. **Tasks** — kaam ka unit. Title, status (To Do / In Progress / Hold / Revision / Complete), priority (Urgent / High / Normal / Low), assignees, due date, description, checklist, comments.
2. **Lists** — tasks ka group (e.g. "Main Tasks", "Sprint 1"). Har list ek Space ke andar hoti hai.
3. **Spaces** — department ya project area (e.g. "Web Development", "HR"). Master "Team Space" folder ke andar har department ki apni space hoti hai.
4. **Workspaces** — pura company / org. Sister company ke liye admin naya workspace bana sakta hai.
5. **Team Members** — invite karke add karte hain. Roles: super_admin, admin, manager, team_lead, employee.
6. **Docs** — SOPs, policies, attachments.
7. **Notifications** — bell icon top-right; task assigned / overdue / commented events aate hain.
8. **Timesheets** — time tracking.
9. **Dashboard** — analytics: status breakdown, priority, monthly trends, team performance.

HOW-TO STYLE:
Agar user pooche "X kaise karu", to **numbered step-by-step guide** Roman Urdu me do. Example:
"Bhai task banane ke liye:
1. Sidebar me apna department khol ke list select karo
2. Top-right pe **+ Task** button dabao
3. Title, priority, due date set karke **Create Task** dabao"

ACTION PROTOCOL (CREATE_TASK):
Jab user clearly task banane bole (e.g. "ek task banao", "create task X", "task add karo"), to tum:
1. Roman Urdu me ek short confirmation likho (e.g. "Theek hai bhai, task bana raha hu...")
2. Phir EXACTLY is format me action tag embed karo (no markdown around it, no code fences):

<action>{"type":"CREATE_TASK","data":{"title":"Task title here","priority":"normal","dueDate":null,"description":null}}</action>

Action data fields:
- title (required, string, max 200 chars)
- priority (optional, one of: "urgent", "high", "normal", "low" — default "normal")
- dueDate (optional, ISO date string "YYYY-MM-DD" or null)
- description (optional, string or null)

Server task ko user ki active list me create karega aur tumhe success/failure batayega next turn me. Tum se sirf valid JSON expected hai — agar fields confirm nahi hain to user se short me poocho rather than guessing.

DO NOT:
- Action tag ke andar koi extra text ya comments na daalo.
- Multiple actions ek hi turn me na karo (ek hi action max).
- Made-up listId, userId, ya workspace ka naam mat use karo.
- Agar user kuch destructive bole (delete workspace / delete user) to politely refuse karke proper UI path bata do.

CURRENT CONTEXT:
- User naam: ${safeName}
- User role: ${safeRole}
- ${listLine}

Reply length cap: ~180 words unless user has asked for a detailed walkthrough.`;
}

/**
 * Pull the first <action>{...}</action> block out of an LLM reply. Returns
 * the parsed JSON + the reply with the tag stripped, or null when nothing
 * actionable was emitted. Tolerates trailing whitespace / minor formatting.
 */
function extractAction(reply) {
  if (!reply || typeof reply !== 'string') return { action: null, cleaned: reply ?? '' };
  const match = reply.match(/<action>\s*([\s\S]*?)\s*<\/action>/i);
  if (!match) return { action: null, cleaned: reply };
  const rawJson = match[1].trim();
  let parsed = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    // If the JSON is malformed we still strip the tag so it doesn't show to the
    // user, but report the failure so the route can surface a helpful message.
    return {
      action: { __parseError: err?.message ?? 'invalid JSON', raw: rawJson },
      cleaned: reply.replace(match[0], '').trim(),
    };
  }
  return {
    action: parsed,
    cleaned: reply.replace(match[0], '').trim(),
  };
}

function sanitizeIncomingMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m === 'object')
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = String(m.content ?? '').slice(0, MAX_MESSAGE_LENGTH);
      return { role, content };
    })
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_HISTORY);
}

/**
 * Pure LLM call — no DB writes. Returns:
 *   { reply: string, action: object|null }
 * The caller (chat route) is responsible for executing any action against
 * the actual data models. This keeps the AI layer isolated and testable.
 */
export async function handleChat({
  messages,
  userName,
  userRole,
  activeListName,
  activeListId,
}) {
  const client = getClient();
  const cleaned = sanitizeIncomingMessages(messages);
  if (cleaned.length === 0) {
    return {
      reply: 'Bhai, message to bhejo! Kya help chahiye?',
      action: null,
    };
  }

  const systemPrompt = buildSystemPrompt({
    userName,
    userRole,
    activeListName,
    activeListId,
  });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 700,
      messages: [{ role: 'system', content: systemPrompt }, ...cleaned],
    });
  } catch (err) {
    const status = err?.status || err?.response?.status || 500;
    const message =
      status === 401
        ? 'AI service ke credentials galat hain. Admin se check karwao.'
        : status === 429
          ? 'Bahut zyada requests aa rahe hain. Thodi der me try karo.'
          : 'AI service abhi available nahi hai. Thodi der me try karo.';
    throw Object.assign(new Error(message), { status: status === 401 ? 503 : status });
  }

  const rawReply = completion?.choices?.[0]?.message?.content ?? '';
  const { action, cleaned: cleanedReply } = extractAction(rawReply);
  const reply = (cleanedReply || 'Hmm, samjha nahi. Dobara try karo bhai.').trim();

  return { reply, action };
}
