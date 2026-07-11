require('dotenv').config();
const OpenAI = require('openai');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
function MODEL() { return process.env.OPENAI_MODEL || 'gpt-4o-mini'; }

async function generatePromoNote(employeeName, role, factors, score, ready) {
  try {
    const metList = factors.filter(f => f.met).map(f => f.label);
    const unmetList = factors.filter(f => !f.met).map(f => f.label);
    const prompt = `You are an HR analyst writing a brief 1-2 sentence readiness note for an employee's promotion review.

Employee: ${employeeName}
Role: ${role}
Promotion Readiness Score: ${score}/100
Status: ${ready ? 'Ready for committee review' : 'Not yet ready'}
Criteria met: ${metList.join(', ') || 'none'}
Criteria not met: ${unmetList.join(', ') || 'none'}

Write a concise, factual 1-2 sentence note explaining the score. Reference the specific criteria. Do not invent any details not provided.`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    const unmet = factors.filter(f => !f.met).map(f => f.label);
    if (unmet.length === 0) return 'All policy criteria are met.';
    return `Missing: ${unmet.join('; ')}. Recommend revisiting once these are addressed.`;
  }
}

async function generateRecRationale(employeeName, role, reviewNotes, courseTitle, courseDescription) {
  try {
    const prompt = `You are an HR learning advisor writing a brief 1-2 sentence course rationale for an employee.

Employee: ${employeeName}
Role: ${role}
Recent performance review notes: ${reviewNotes}
Recommended course: ${courseTitle}
Course description: ${courseDescription}

Write a concise 1-2 sentence rationale explaining why this specific course is recommended for this employee right now, grounded in their actual performance notes. Be specific and factual. Do not invent details not in the notes.`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    return `${courseTitle} aligns with ${employeeName}'s current role and development areas identified in their recent review.`;
  }
}

async function classifyIntent(question) {
  try {
    const prompt = `Classify this HR question into one of these intents and extract any employee name mentioned.

Intents:
- pending: questions about pending or overdue requests older than 3 days
- lateAttendance: questions about employees with repeated late attendance
- awaitingApproval: questions about requests awaiting manager approval
- approvedToday: questions about requests approved today
- attendance: questions about a specific employee's attendance record
- balance: questions about a specific employee's leave balance
- policy: questions about policy on a specific employee's recent request
- manager: questions about who a specific employee's manager is
- tenure: questions about how long a specific employee has been in their role
- unknown: anything else

Question: "${question}"

Respond with valid JSON only: {"intent": "<one of the intents above>", "employeeName": "<full name if mentioned, else null>"}`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 60,
    });
    const parsed = JSON.parse(res.choices[0].message.content);
    return {
      intent: parsed.intent || 'unknown',
      employeeName: parsed.employeeName || null,
    };
  } catch (e) {
    return { intent: 'unknown', employeeName: null };
  }
}

async function generateChatReply(intent, data) {
  try {
    const prompt = `You are an AI HR Copilot. Generate a natural, concise reply (1-3 sentences) for an HR officer based on the following computed facts. Do not invent any numbers or names not in the data.

Intent: ${intent}
Data: ${JSON.stringify(data)}

Reply naturally as if speaking to an HR professional. Be direct and informative.`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    return formatFallbackReply(intent, data);
  }
}

function formatFallbackReply(intent, data) {
  switch (intent) {
    case 'pending':
      return data.count === 0
        ? 'No requests are currently older than 3 days.'
        : `Found ${data.count} overdue request(s): ${data.items.map(i => `${i.name}'s ${i.type} (${i.days} days)`).join(', ')}.`;
    case 'lateAttendance':
      return data.employees.length === 0
        ? 'No employees show repeated late attendance this month.'
        : `${data.employees.length} employee(s) with repeated late attendance this month: ${data.employees.join(', ')}.`;
    case 'awaitingApproval':
      return `${data.count} request(s) awaiting manager approval.`;
    case 'approvedToday':
      return data.count === 0 ? 'No requests approved today.' : `${data.count} request(s) approved today.`;
    case 'attendance':
      return `${data.name} has ${data.pct}% attendance this quarter (${data.present + data.late} present/late out of ${data.total} days).`;
    case 'balance':
      return `${data.name} has ${data.balance} days of leave remaining.`;
    case 'policy':
      return `${data.name}'s most recent request is a ${data.type} with status: ${data.status}.`;
    case 'manager':
      return `${data.name}'s manager is ${data.manager}.`;
    case 'tenure':
      return `${data.name} has been in their current role as ${data.role} for ${data.years} years.`;
    default:
      return "I can help with pending requests, attendance, leave balances, or policy checks. Try one of the suggestion chips above.";
  }
}

module.exports = { generatePromoNote, generateRecRationale, classifyIntent, generateChatReply };
