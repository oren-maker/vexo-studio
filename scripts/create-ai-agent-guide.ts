import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Stage = { title: string; content: string; type: "start" | "middle" | "end" };

const SLUG = "build-ai-agent-guide";
const LANG = "he";
const TITLE = "לבנות סוכן AI מאפס — מהקונספט ועד קוד עובד";
const DESCRIPTION = "מדריך צעד-אחר-צעד לבניית סוכן AI עם Python, LangChain ו-LangGraph — מוח, כלים, ולולאה. מקונספט ועד קוד עובד.";
const CATEGORY = "פיתוח AI";
const AUTHOR = "אורן";
const MINUTES = 12;

const STAGES: Stage[] = [
  {
    type: "start",
    title: "מה זה בכלל סוכן?",
    content: `צ׳אטבוט **מגיב**. סוכן **פועל**.

צ׳אטבוט מקבל שאלה ומחזיר תשובה. סוכן מקבל מטרה, בונה תוכנית, משתמש בכלים, בודק תוצאות, ומתקן את עצמו עד שהמשימה מושלמת.

שלושה דברים חייבים להיות לכל סוכן:
- **מוח** — מודל שפה שיודע לחשוב ולתכנן (LLM)
- **כלים** — פונקציות שהסוכן יכול להפעיל (חיפוש, חישוב, קריאה ל-API)
- **לולאה** — תהליך שחוזר עד שהמטרה מושגת`,
  },
  {
    type: "middle",
    title: "הלולאה — הלב של כל סוכן",
    content: `כל סוכן עובד באותו דפוס:

1. המשתמש נותן מטרה
2. ה-LLM חושב ומתכנן
3. מפעיל כלי ומקבל תוצאה — חוזר ל-LLM
4. בודק אם המטרה הושגת
   - אם כן → מחזיר תשובה סופית
   - אם לא → חוזר לצעד 2

זה הקסם. הסוכן לא עונה פעם אחת ומסיים — הוא ממשיך לעבוד עד שהמשימה באמת נגמרת.`,
  },
  {
    type: "middle",
    title: "הסטאק שנעבוד איתו",
    content: `שלוש בחירות טכנולוגיה מכריעות:

- **שפה:** Python 3.11+ — אקוסיסטם ענק, תמיכה מלאה ב-LLM
- **פריימוורק:** LangChain + LangGraph — לולאות סוכן, ניתוב כלים, זיכרון מובנה
- **מודל:** OpenAI GPT-4o או Claude — כל מודל עובד דרך הממשק של LangChain

אין צורך להתחייב למודל אחד — אפשר להחליף בשורה אחת.`,
  },
  {
    type: "middle",
    title: "שלב 1 — הקמת הסביבה",
    content: `יצירת סביבה וירטואלית, התקנת החבילות, וטעינת API key.

\`\`\`bash
# יצירת סביבה וירטואלית
python -m venv .venv
source .venv/bin/activate

# התקנת החבילות
pip install langchain langchain-openai \\
    langgraph python-dotenv
\`\`\`

ולקובץ \`.env\`:

\`\`\`env
OPENAI_API_KEY=sk-...
\`\`\`

זהו. הסביבה מוכנה.`,
  },
  {
    type: "middle",
    title: "שלב 2 — בניית כלים לסוכן",
    content: `ב-LangChain, כלים הם פונקציות Python רגילות עם דקורטור \`@tool\`. הסוכן מחליט לבד מתי לקרוא להם.

\`\`\`python
# tools.py
from langchain_core.tools import tool
import requests

@tool
def web_search(query: str) -> str:
    """Search the web. Returns top result."""
    url = f"https://api.duckduckgo.com/?q={query}&format=json"
    data = requests.get(url).json()
    return data.get("AbstractText", "No result")

@tool
def calculate(expr: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expr))

tools = [web_search, calculate]
\`\`\`

שני כלים פשוטים: חיפוש ומחשבון. הסוכן יבחר את הנכון לפי השאלה.`,
  },
  {
    type: "middle",
    title: "שלב 3 — כתיבת System Prompt",
    content: `ה-System Prompt הוא ה-DNA של הסוכן. הוא קובע מי הסוכן, מה הכללים, ומתי להשתמש בכלים.

\`\`\`python
# agent.py — system prompt
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a research agent.

Goal: Answer the user's question accurately.

Rules:
- Use web_search for current information.
- Use calculate for any math.
- Think step by step before acting.
- Keep answers concise and factual.
"""),
    ("placeholder", "{messages}"),
])
\`\`\`

**טיפ:** תהיו ספציפיים. "השתמש ב-web_search למידע עדכני" עדיף על "חפש מידע כשצריך".`,
  },
  {
    type: "middle",
    title: "שלב 4 — הרכבת הסוכן",
    content: `עכשיו מחברים הכל — מודל, כלים, ו-prompt.

\`\`\`python
# agent.py — langchain agent
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from tools import tools
from agent import prompt

# 1. בחירת מודל
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# 2. חיבור כלים למודל
agent = create_tool_calling_agent(llm, tools, prompt)

# 3. עטיפה ב-executor (מנהל הלולאה)
executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
)

# 4. הפעלה
result = executor.invoke({
    "messages": [("user", "What is the population of Israel squared?")]
})
print(result["output"])
\`\`\`

הסוכן מקבל שאלה, מחליט שצריך חיפוש, מחפש, מקבל מספר, מחליט שצריך חישוב, מחשב, ומחזיר תשובה. הכל אוטומטי.`,
  },
  {
    type: "middle",
    title: "שלב 5 — שדרוג עם LangGraph",
    content: `LangChain מספיק לסוכן בסיסי. אבל LangGraph לוקח את זה רמה למעלה — לולאה מובנית עם שליטה מלאה על כל שלב.

\`\`\`python
# graph_agent.py — langgraph loop
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from tools import tools

# LangGraph ReAct agent = full loop built-in
# Reason ← Act ← Observe ← Repeat
llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(llm, tools)

# Stream tokens as the agent reasons
for chunk in agent.stream({
    "messages": [("user", "Latest GPT-4o benchmark score?")]
}):
    print(chunk)
\`\`\`

שלוש שורות וסוכן מלא עם לולאה, כלים, וסטרימינג.`,
  },
  {
    type: "middle",
    title: "שלב 6 — שדרוגים שהופכים את זה לרציני",
    content: `שלושה שדרוגים עיקריים שמעבירים את הסוכן מ-demo למוצר.

**זיכרון בין שיחות** — \`MemorySaver\` נותן לסוכן לזכור שיחות קודמות:

\`\`\`python
from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()
agent = create_react_agent(llm, tools, checkpointer=memory)

# כל שיחה מקבלת thread_id וזוכרת היסטוריה
config = {"configurable": {"thread_id": "user-123"}}
agent.invoke({"messages": [("user", "Hi, I'm Oren")]}, config=config)
agent.invoke({"messages": [("user", "What's my name?")]}, config=config)
# → "Oren"
\`\`\`

**כלים נוספים** — כל פונקציה עם \`@tool\` הופכת לכלי. ה-LLM יקרא לה לבד לפי השם והתיאור.

**מולטי-אייג׳נט** — במקום סוכן אחד שעושה הכל, צוות של מתמחים (חוקר, כותב, ובודק) שעובדים ביחד. LangGraph מספק \`StateGraph\` לזה.`,
  },
  {
    type: "middle",
    title: "מה הלאה",
    content: `אחרי שבניתם סוכן בסיסי:

- **הוסיפו כלים ספציפיים לתחום שלכם** — API של הפלטפורמות שאתם עובדים איתן
- **תנו לסוכן זיכרון** — \`MemorySaver\` כדי שידע מה קרה בשיחות קודמות
- **בנו מערכת מולטי-אייג׳נט** — חוקר, כותב, ובודק שעובדים ביחד
- **חברו ל-Claude Code** — תנו ל-Claude Code לבנות ולשפר את הסוכן בשבילכם

זה הרגע שהטכנולוגיה מפסיקה להיות צעצוע והופכת לכלי עבודה.`,
  },
  {
    type: "end",
    title: "לסיכום",
    content: `- **סוכן ≠ צ׳אטבוט.** סוכן מתכנן, פועל, ומתקן את עצמו בלולאה.
- **3 רכיבים:** מוח (LLM) + כלים (functions) + לולאה (agent loop).
- **Python + LangChain** = סוכן עובד בדקות.
- **LangGraph** = לולאה מתקדמת עם סטרימינג ושליטה מלאה.
- **שדרוגים:** זיכרון, כלים נוספים, מולטי-אייג׳נט.
- **הכל קוד פתוח, חינמי, מתועד, וקהילה ענקית.**`,
  },
];

async function main() {
  const existing = await prisma.guide.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`[build-ai-agent-guide] existing guide found (id=${existing.id}) — deleting for fresh rebuild`);
    await prisma.guide.delete({ where: { id: existing.id } });
  }

  const guide = await prisma.guide.create({
    data: {
      slug: SLUG,
      defaultLang: LANG,
      status: "published",
      isPublic: true,
      source: "authored",
      category: CATEGORY,
      authorName: AUTHOR,
      estimatedMinutes: MINUTES,
      translations: {
        create: { lang: LANG, title: TITLE, description: DESCRIPTION, isAuto: false },
      },
      stages: {
        create: STAGES.map((s, i) => ({
          order: i,
          type: s.type,
          transitionToNext: "fade",
          translations: { create: { lang: LANG, title: s.title, content: s.content, isAuto: false } },
        })),
      },
    },
    include: { stages: true },
  });

  console.log(`[build-ai-agent-guide] created guide id=${guide.id} slug=${guide.slug} stages=${guide.stages.length}`);
  console.log(`→ https://vexo-studio.vercel.app/learn/guides/${guide.slug}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
