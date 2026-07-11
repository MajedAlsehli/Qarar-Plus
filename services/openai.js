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

function keywordClassify(question) {
  const q = question.toLowerCase();
  if (/pending|overdue/.test(q)) return { intent: 'pending', employeeName: null };
  if (/late attendance|repeated late|coming late|late this month/.test(q)) return { intent: 'lateAttendance', employeeName: null };
  if (/await|waiting.*approval|manager approval|not yet approved/.test(q)) return { intent: 'awaitingApproval', employeeName: null };
  if (/approved today|today.*approv/.test(q)) return { intent: 'approvedToday', employeeName: null };
  if (/not ready|not.*promot|promot.*not|unready/.test(q)) return { intent: 'promotionNotReady', employeeName: null };
  if (/ready for promot|promot.*ready|who.*promot/.test(q)) return { intent: 'promotionReady', employeeName: null };
  if (/top perform|best perform|high perform/.test(q)) return { intent: 'topPerformers', employeeName: null };
  if (/headcount|how many.*employ|employ.*count|staff count/.test(q)) return { intent: 'headcount', employeeName: null };
  if (/missing cert|no cert|without cert|leadership cert/.test(q)) return { intent: 'certMissing', employeeName: null };
  if (/new joiner|joined.*year|recently joined|new hire/.test(q)) return { intent: 'newJoiners', employeeName: null };
  if (/burnout|overwork|at risk|high overtime|exhausted/.test(q)) return { intent: 'burnoutRisk', employeeName: null };
  if (/open headcount|open position|open role|open req|hiring plan|open vacanc/.test(q)) return { intent: 'openHeadcount', employeeName: null };
  if (/turnover|attrition|exit|how many.*left|who.*left|resignat/.test(q)) return { intent: 'turnoverRate', employeeName: null };
  if (/disciplin|warning|pip|formal action|misconduct/.test(q)) return { intent: 'disciplinaryCheck', employeeName: null };
  if (/leave policy|annual leave policy|sick leave policy|maternity|paternity|emergency leave/.test(q)) return { intent: 'leavePolicy', employeeName: null };
  if (/overtime policy|overtime rule|overtime pay|overtime cap/.test(q)) return { intent: 'overtimePolicy', employeeName: null };
  if (/expense policy|expense claim policy|receipt|reimburs/.test(q)) return { intent: 'expensePolicy', employeeName: null };
  if (/attendance policy|late policy|core hours|remote work policy/.test(q)) return { intent: 'attendancePolicy', employeeName: null };
  if (/summary of|tell me about|overview of|briefing on|profile of/.test(q)) return { intent: 'employeeSummary', employeeName: null };
  if (/attendance|absent|present|showing up/.test(q)) return { intent: 'attendance', employeeName: null };
  if (/leave balance|days (off|remaining|left)|vacation/.test(q)) return { intent: 'balance', employeeName: null };
  if (/policy|recent request|request status/.test(q)) return { intent: 'policy', employeeName: null };
  if (/\bmanager\b|reports to|who.*manage|managed by/.test(q)) return { intent: 'manager', employeeName: null };
  if (/tenure|how long|years in|time in (role|position)/.test(q)) return { intent: 'tenure', employeeName: null };
  return { intent: 'unknown', employeeName: null };
}

async function classifyIntent(question) {
  try {
    const prompt = `Classify this HR question into one of these intents and extract any employee name mentioned.

Intents:
- pending: questions about pending or overdue requests older than 3 days
- lateAttendance: questions about employees with repeated late attendance
- awaitingApproval: questions about requests awaiting manager approval
- approvedToday: questions about requests approved today
- promotionReady: questions about who is ready for promotion
- promotionNotReady: questions about who is not ready for promotion
- topPerformers: questions about top performers
- headcount: questions about headcount or staff count by department
- certMissing: questions about employees missing leadership certification
- newJoiners: questions about recently hired employees
- burnoutRisk: questions about employees at risk of burnout or working excessive overtime
- openHeadcount: questions about open job requisitions or hiring plans
- turnoverRate: questions about employee exits or turnover
- disciplinaryCheck: questions about disciplinary actions, warnings, or PIPs
- leavePolicy: questions about the leave or annual leave policy
- overtimePolicy: questions about the overtime policy or rules
- expensePolicy: questions about the expense claims or reimbursement policy
- attendancePolicy: questions about the attendance policy or core hours
- attendance: questions about a specific employee's attendance record
- balance: questions about a specific employee's leave balance
- policy: questions about policy on a specific employee's recent request
- manager: questions about who a specific employee's manager is
- tenure: questions about how long a specific employee has been in their role
- employeeSummary: requests for a full profile or summary of a specific employee
- unknown: anything else

Question: "${question}"

Respond with valid JSON only: {"intent": "<one of the intents above>", "employeeName": "<full name if mentioned, else null>"}`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 80,
    });
    const parsed = JSON.parse(res.choices[0].message.content);
    const intent = parsed.intent || 'unknown';
    if (intent === 'unknown') return keywordClassify(question);
    return { intent, employeeName: parsed.employeeName || null };
  } catch (e) {
    return keywordClassify(question);
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
    case 'promotionReady':
      return data.count === 0
        ? 'No employees currently meet all promotion criteria.'
        : `${data.count} employee(s) meet all promotion criteria: ${data.employees.map(e => `${e.name} (${e.department})`).join(', ')}.`;
    case 'topPerformers':
      return data.count === 0
        ? 'No employees met both performance and goal targets this quarter.'
        : `${data.count} employee(s) met both performance and goal targets this quarter: ${data.employees.map(e => e.name).join(', ')}.`;
    case 'headcount':
      return `Total headcount: ${data.total}. Breakdown — ${data.departments.map(d => `${d.department}: ${d.count}`).join(', ')}.`;
    case 'certMissing':
      return data.count === 0
        ? 'All employees have their leadership certification.'
        : `${data.count} employee(s) are missing their leadership certification: ${data.employees.map(e => e.name).join(', ')}.`;
    case 'newJoiners':
      return data.count === 0
        ? 'No employees joined in the last year.'
        : `${data.count} employee(s) joined in the last year: ${data.employees.map(e => e.name).join(', ')}.`;
    default:
      return "I can help with pending requests, attendance, leave balances, promotion readiness, headcount, and more. Try one of the suggestion chips above.";
  }
}

async function generateEmployeeSummary(data) {
  try {
    const prompt = `You are an HR AI Copilot. Write a professional 3-4 sentence HR briefing for this employee, as if preparing a manager for a performance conversation. Be specific, factual, and insightful. Mention standout strengths, any areas of concern, and one concrete development recommendation. Do not invent any details not provided.

Employee: ${data.name}
Role: ${data.role} | Department: ${data.department} | Grade: ${data.grade}
Manager: ${data.manager}
Tenure in role: ${data.tenureYears} years | Hire date: ${data.hireDate}
Attendance (Q3 2025): ${data.attendancePct}% (${data.present} present, ${data.late} late, ${data.absent} absent out of ${data.totalDays} days)
Leave balance: ${data.leaveBalance} days remaining
Promotion readiness: ${data.promotionReady ? 'Ready — all 5 criteria met' : `Not yet ready — missing: ${data.missingCriteria.join(', ')}`}
Leadership certification: ${data.leadershipCert ? 'Completed' : 'Not completed'}
Performance rating met: ${data.perfMet ? 'Yes' : 'No'} | Goal achievement met: ${data.goalMet ? 'Yes' : 'No'}
Manager feedback: ${data.managerFeedback ? 'Positive' : 'Needs improvement'} | Peer feedback: ${data.peerFeedback ? 'Positive' : 'Needs improvement'}
${data.overtimeHours ? `Recent overtime: ${data.overtimeHours} hours last month (${data.overtimeRisk ? 'HIGH — potential burnout risk' : 'within acceptable range'})` : 'No overtime records in last 3 months.'}
${data.disciplinaryStatus ? `Disciplinary status: ${data.disciplinaryStatus}` : 'No active disciplinary records.'}
${data.trainingCompleted.length > 0 ? `Recent training completed: ${data.trainingCompleted.join(', ')}` : 'No training completions on record.'}
Latest performance review notes: "${data.reviewNotes}"

Write the briefing now:`;

    const res = await getClient().chat.completions.create({
      model: MODEL(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    const issues = [];
    if (!data.perfMet) issues.push('performance rating not met');
    if (!data.goalMet) issues.push('goal achievement not met');
    if (!data.leadershipCert) issues.push('leadership cert pending');
    if (data.overtimeRisk) issues.push('high overtime');
    const positive = data.promotionReady ? 'meets all promotion criteria' : '';
    return `${data.name} is a ${data.role} in ${data.department} with ${data.tenureYears} years in role. ` +
      (positive ? `${data.name} ${positive}. ` : '') +
      (issues.length ? `Areas requiring attention: ${issues.join(', ')}. ` : '') +
      `Attendance stands at ${data.attendancePct}% with ${data.leaveBalance} days leave remaining.`;
  }
}

module.exports = { generatePromoNote, generateRecRationale, classifyIntent, generateChatReply, generateEmployeeSummary };
