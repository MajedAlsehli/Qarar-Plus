const express = require('express');
const router = express.Router();
const db = require('../db');
const { classifyIntent, generateChatReply, generateEmployeeSummary } = require('../services/openai');

const ORG_WIDE_INTENTS = ['pending','lateAttendance','awaitingApproval','approvedToday',
  'promotionReady','promotionNotReady','topPerformers','headcount','certMissing','newJoiners',
  'burnoutRisk','openHeadcount','turnoverRate','disciplinaryCheck',
  'leavePolicy','overtimePolicy','expensePolicy','attendancePolicy'];

function formatOrgReply(intent, data) {
  const names = (arr) => arr.map(e => e.name).join(', ');
  switch (intent) {
    case 'pending':
      return data.count === 0
        ? 'No requests are currently older than 3 days.'
        : `Found ${data.count} overdue request(s): ${data.items.map(i => `${i.name}'s ${i.type} (${i.days} day${i.days>1?'s':''})`).join(', ')}.`;
    case 'lateAttendance':
      return data.employees.length === 0
        ? 'No employees show repeated late attendance this month.'
        : `${data.employees.length} employee(s) with 2+ late records this month: ${data.employees.join(', ')}.`;
    case 'awaitingApproval':
      return data.count === 0 ? 'No requests are currently awaiting manager approval.'
        : `${data.count} request(s) awaiting approval: ${data.items.map(i => `${i.name}'s ${i.type}`).join(', ')}.`;
    case 'approvedToday':
      return data.count === 0 ? 'No requests have been approved today.'
        : `${data.count} request(s) approved today: ${data.items.map(i => `${i.name}'s ${i.type}`).join(', ')}.`;
    case 'promotionReady':
      return data.count === 0 ? 'No employees currently meet all promotion criteria.'
        : `${data.count} employee(s) meet all promotion criteria: ${names(data.employees)}.`;
    case 'promotionNotReady':
      return data.count === 0 ? 'All employees currently meet promotion criteria.'
        : `${data.count} employee(s) do not yet meet all promotion criteria: ${names(data.employees)}.`;
    case 'topPerformers':
      return data.count === 0 ? 'No employees met both performance and goal targets this quarter.'
        : `${data.count} top performer(s) this quarter (met both performance rating and goal targets): ${names(data.employees)}.`;
    case 'headcount':
      return `Total headcount: ${data.total}. Breakdown — ${data.departments.map(d => `${d.department}: ${d.count}`).join(', ')}.`;
    case 'certMissing':
      return data.count === 0 ? 'All employees have their leadership certification.'
        : `${data.count} employee(s) missing leadership certification: ${names(data.employees)}.`;
    case 'newJoiners':
      return data.count === 0 ? 'No employees joined in the last year.'
        : `${data.count} employee(s) joined in the last year: ${names(data.employees)}.`;
    case 'burnoutRisk':
      return data.employees.length === 0
        ? 'No employees currently show high overtime combined with attendance concerns.'
        : `${data.employees.length} employee(s) flagged for burnout risk (high overtime + below-90% attendance): ${data.employees.map(e => `${e.name} (${e.hours}h OT last month, ${e.att}% attendance)`).join(', ')}.`;
    case 'openHeadcount':
      return data.count === 0 ? 'No open headcount requests at this time.'
        : `${data.count} open headcount request(s): ${data.items.map(i => `${i.role_title} in ${i.department} (${i.grade}) — ${i.status}`).join('; ')}.`;
    case 'turnoverRate':
      return data.count === 0 ? 'No exit records in the last 12 months.'
        : `${data.count} employee(s) exited in the last 12 months. Breakdown — ${data.byType.map(t => `${t.exit_type}: ${t.count}`).join(', ')}. Departments affected: ${data.byDept.map(d => `${d.department}: ${d.count}`).join(', ')}.`;
    case 'disciplinaryCheck':
      return data.active.length === 0 && data.pips.length === 0
        ? 'No active disciplinary records or PIPs on file.'
        : [
            data.pips.length ? `${data.pips.length} active PIP(s): ${data.pips.join(', ')}.` : '',
            data.warnings.length ? `${data.warnings.length} active warning(s): ${data.warnings.join(', ')}.` : '',
            data.commendations.length ? `${data.commendations.length} recent commendation(s): ${data.commendations.join(', ')}.` : '',
          ].filter(Boolean).join(' ');
    case 'leavePolicy':
      return data.policies.map(p => `**${p.title}**: ${p.summary}`).join(' | ');
    case 'overtimePolicy':
      return data.policies.map(p => `**${p.title}**: ${p.summary}`).join(' | ');
    case 'expensePolicy':
      return data.policies.map(p => `**${p.title}**: ${p.summary}`).join(' | ');
    case 'attendancePolicy':
      return data.policies.map(p => `**${p.title}**: ${p.summary}`).join(' | ');
    default: return null;
  }
}

async function handleIntent(intent, empId) {
  switch (intent) {
    case 'pending': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type,
                GREATEST(1, EXTRACT(DAY FROM NOW() - rq.submitted_at)::int) AS days
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.submitted_at < NOW() - INTERVAL '3 days'
           AND rq.status IN ('pending','overdue')
         ORDER BY rq.submitted_at ASC`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'lateAttendance': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, COUNT(*) AS late_count
         FROM attendance_records ar JOIN employees e ON ar.employee_id = e.id
         WHERE ar.status = 'late'
           AND DATE_TRUNC('month', ar.date) = DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY e.id, e.first_name, e.last_name
         HAVING COUNT(*) >= 2
         ORDER BY late_count DESC`
      );
      return { intent, data: { employees: r.rows.map(row => row.name), counts: r.rows } };
    }
    case 'awaitingApproval': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.status IN ('pending','needs_policy_check')
         ORDER BY rq.submitted_at ASC`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'approvedToday': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.status = 'approved' AND DATE(rq.submitted_at) = CURRENT_DATE`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'attendance': {
      if (!empId) return null;
      const emp = await db.query('SELECT first_name, last_name FROM employees WHERE id = $1', [empId]);
      if (!emp.rows.length) return null;
      const name = `${emp.rows[0].first_name} ${emp.rows[0].last_name}`;
      const r = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) FILTER (WHERE status = 'late') AS late,
           COUNT(*) FILTER (WHERE status = 'absent') AS absent,
           COUNT(*) AS total
         FROM attendance_records
         WHERE employee_id = $1
           AND date BETWEEN '2025-07-01' AND '2025-09-30'`,
        [empId]
      );
      const row = r.rows[0];
      const present = parseInt(row.present);
      const late = parseInt(row.late);
      const total = parseInt(row.total);
      const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      return { intent, data: { name, present, late, total, pct } };
    }
    case 'balance': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, leave_balance FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, balance: e.leave_balance } };
    }
    case 'policy': {
      if (!empId) return null;
      const emp = await db.query('SELECT first_name, last_name, manager_name FROM employees WHERE id = $1', [empId]);
      if (!emp.rows.length) return null;
      const name = `${emp.rows[0].first_name} ${emp.rows[0].last_name}`;
      const r = await db.query(
        `SELECT type, status FROM requests WHERE employee_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [empId]
      );
      const req = r.rows[0] || { type: 'leave', status: 'pending' };
      return { intent, data: { name, type: req.type, status: req.status, manager: emp.rows[0].manager_name } };
    }
    case 'manager': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, manager_name FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, manager: e.manager_name } };
    }
    case 'tenure': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, role, role_start_date FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      const years = ((Date.now() - new Date(e.role_start_date).getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1);
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, role: e.role, years } };
    }
    case 'promotionReady': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.performance_rating_met = true AND e.goal_achievement_met = true
           AND e.leadership_cert = true AND e.manager_feedback_positive = true
           AND e.peer_feedback_positive = true
           AND (CURRENT_DATE - e.role_start_date) / 365.25 >= 2
         ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'promotionNotReady': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE NOT (
           e.performance_rating_met = true AND e.goal_achievement_met = true
           AND e.leadership_cert = true AND e.manager_feedback_positive = true
           AND e.peer_feedback_positive = true
           AND (CURRENT_DATE - e.role_start_date) / 365.25 >= 2
         )
         ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'topPerformers': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.performance_rating_met = true AND e.goal_achievement_met = true
         ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'headcount': {
      const r = await db.query(
        `SELECT d.label AS department, COUNT(e.id)::int AS count
         FROM departments d LEFT JOIN employees e ON e.department_id = d.id
         GROUP BY d.id, d.label ORDER BY d.label`
      );
      const total = r.rows.reduce((s, row) => s + row.count, 0);
      return { intent, data: { departments: r.rows, total } };
    }
    case 'certMissing': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.leadership_cert = false ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'newJoiners': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department,
                e.hire_date
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.hire_date >= CURRENT_DATE - INTERVAL '1 year'
         ORDER BY e.hire_date DESC`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'burnoutRisk': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.id,
                ot.hours,
                ROUND(100.0 * COUNT(ar.id) FILTER (WHERE ar.status IN ('present','late')) / NULLIF(COUNT(ar.id),0)) AS att
         FROM overtime_records ot
         JOIN employees e ON ot.employee_id = e.id
         JOIN attendance_records ar ON ar.employee_id = e.id
           AND ar.date BETWEEN '2025-07-01' AND '2025-09-30'
         WHERE ot.hours >= 15
           AND ot.month = (SELECT month FROM overtime_records ORDER BY month DESC LIMIT 1)
         GROUP BY e.id, e.first_name, e.last_name, ot.hours
         HAVING ROUND(100.0 * COUNT(ar.id) FILTER (WHERE ar.status IN ('present','late')) / NULLIF(COUNT(ar.id),0)) < 90
         ORDER BY ot.hours DESC`
      );
      return { intent, data: { employees: r.rows.map(row => ({ name: row.name, hours: row.hours, att: parseInt(row.att) })) } };
    }
    case 'openHeadcount': {
      const r = await db.query(
        `SELECT hr.role_title, hr.grade, hr.status, hr.justification, d.label AS department
         FROM headcount_requests hr JOIN departments d ON hr.department_id = d.id
         WHERE hr.status IN ('pending','approved')
         ORDER BY hr.requested_date DESC`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'turnoverRate': {
      const r = await db.query(
        `SELECT COUNT(*) AS count FROM exit_records
         WHERE exit_date >= CURRENT_DATE - INTERVAL '1 year'`
      );
      const byType = await db.query(
        `SELECT exit_type, COUNT(*) AS count FROM exit_records
         WHERE exit_date >= CURRENT_DATE - INTERVAL '1 year'
         GROUP BY exit_type ORDER BY count DESC`
      );
      const byDept = await db.query(
        `SELECT department, COUNT(*) AS count FROM exit_records
         WHERE exit_date >= CURRENT_DATE - INTERVAL '1 year'
         GROUP BY department ORDER BY count DESC`
      );
      return { intent, data: { count: parseInt(r.rows[0].count), byType: byType.rows, byDept: byDept.rows } };
    }
    case 'disciplinaryCheck': {
      const pips = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name
         FROM disciplinary_records dr JOIN employees e ON dr.employee_id = e.id
         WHERE dr.type = 'pip' AND dr.resolved = false ORDER BY dr.issued_date DESC`
      );
      const warnings = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name
         FROM disciplinary_records dr JOIN employees e ON dr.employee_id = e.id
         WHERE dr.type IN ('written_warning','verbal_warning','final_warning') AND dr.resolved = false
         ORDER BY dr.issued_date DESC`
      );
      const commendations = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name
         FROM disciplinary_records dr JOIN employees e ON dr.employee_id = e.id
         WHERE dr.type = 'commendation' AND dr.issued_date >= CURRENT_DATE - INTERVAL '6 months'
         ORDER BY dr.issued_date DESC LIMIT 5`
      );
      return {
        intent,
        data: {
          active: [...pips.rows, ...warnings.rows],
          pips: pips.rows.map(r => r.name),
          warnings: warnings.rows.map(r => r.name),
          commendations: commendations.rows.map(r => r.name),
        },
      };
    }
    case 'leavePolicy': {
      const r = await db.query(
        `SELECT title, summary FROM hr_policies WHERE category = 'leave' ORDER BY id`
      );
      return { intent, data: { policies: r.rows } };
    }
    case 'overtimePolicy': {
      const r = await db.query(
        `SELECT title, summary FROM hr_policies WHERE category = 'overtime' ORDER BY id`
      );
      return { intent, data: { policies: r.rows } };
    }
    case 'expensePolicy': {
      const r = await db.query(
        `SELECT title, summary FROM hr_policies WHERE category = 'expense' ORDER BY id`
      );
      return { intent, data: { policies: r.rows } };
    }
    case 'attendancePolicy': {
      const r = await db.query(
        `SELECT title, summary FROM hr_policies WHERE category = 'attendance' ORDER BY id`
      );
      return { intent, data: { policies: r.rows } };
    }
    case 'employeeSummary': {
      if (!empId) return null;
      const empRes = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department,
                e.manager_name, e.hire_date, e.role_start_date, e.leave_balance,
                e.leadership_cert, e.performance_rating_met, e.goal_achievement_met,
                e.manager_feedback_positive, e.peer_feedback_positive,
                sg.grade
         FROM employees e
         JOIN departments d ON e.department_id = d.id
         LEFT JOIN salary_grades sg ON e.grade_id = sg.id
         WHERE e.id = $1`,
        [empId]
      );
      if (!empRes.rows.length) return null;
      const emp = empRes.rows[0];
      const tenureYears = ((Date.now() - new Date(emp.role_start_date).getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1);

      const attRes = await db.query(
        `SELECT COUNT(*) FILTER (WHERE status='present') AS present,
                COUNT(*) FILTER (WHERE status='late') AS late,
                COUNT(*) FILTER (WHERE status='absent') AS absent,
                COUNT(*) AS total
         FROM attendance_records WHERE employee_id = $1
           AND date BETWEEN '2025-07-01' AND '2025-09-30'`,
        [empId]
      );
      const att = attRes.rows[0];
      const present = parseInt(att.present), late = parseInt(att.late),
            absent = parseInt(att.absent), total = parseInt(att.total);
      const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      const reviewRes = await db.query(
        `SELECT notes FROM performance_reviews WHERE employee_id = $1 ORDER BY id DESC LIMIT 1`,
        [empId]
      );
      const reviewNotes = reviewRes.rows[0]?.notes || '';

      const otRes = await db.query(
        `SELECT hours, month FROM overtime_records WHERE employee_id = $1
         ORDER BY month DESC LIMIT 1`,
        [empId]
      );
      const otHours = otRes.rows[0]?.hours || 0;
      const otRisk = otHours > 20 && pct < 90;

      const discRes = await db.query(
        `SELECT type, reason FROM disciplinary_records
         WHERE employee_id = $1 AND resolved = false ORDER BY issued_date DESC LIMIT 1`,
        [empId]
      );
      const discStatus = discRes.rows[0]
        ? `${discRes.rows[0].type.replace(/_/g, ' ')} — ${discRes.rows[0].reason.substring(0, 80)}`
        : null;

      const trainRes = await db.query(
        `SELECT course_title FROM training_completions WHERE employee_id = $1
         ORDER BY completed_date DESC LIMIT 3`,
        [empId]
      );
      const trainingCompleted = trainRes.rows.map(r => r.course_title);

      const missingCriteria = [];
      if (!emp.performance_rating_met) missingCriteria.push('performance rating');
      if (!emp.goal_achievement_met) missingCriteria.push('goal achievement');
      if (!emp.leadership_cert) missingCriteria.push('leadership certification');
      if (!emp.manager_feedback_positive) missingCriteria.push('positive manager feedback');
      if (!emp.peer_feedback_positive) missingCriteria.push('positive peer feedback');
      if (parseFloat(tenureYears) < 2) missingCriteria.push('minimum 2 years in role');

      const summaryData = {
        name: emp.name, role: emp.role, department: emp.department,
        grade: emp.grade || 'N/A', manager: emp.manager_name,
        hireDate: emp.hire_date, tenureYears, leaveBalance: emp.leave_balance,
        attendancePct: pct, present, late, absent, totalDays: total,
        promotionReady: missingCriteria.length === 0, missingCriteria,
        leadershipCert: emp.leadership_cert, perfMet: emp.performance_rating_met,
        goalMet: emp.goal_achievement_met, managerFeedback: emp.manager_feedback_positive,
        peerFeedback: emp.peer_feedback_positive, overtimeHours: otHours,
        overtimeRisk: otRisk, disciplinaryStatus: discStatus,
        trainingCompleted, reviewNotes,
      };

      const aiReply = await generateEmployeeSummary(summaryData);
      return { intent, data: summaryData, aiReply };
    }
    default:
      return null;
  }
}

router.post('/chat', async (req, res) => {
  try {
    let { kind, empId, question } = req.body;

    if (empId !== undefined && empId !== null) {
      empId = parseInt(empId, 10);
      if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });
    }

    const needsEmployee = ['attendance','balance','policy','manager','tenure','employeeSummary'].includes(kind);

    if (kind === 'freetext') {
      const classified = await classifyIntent(question || '');
      kind = classified.intent;

      if (kind === 'unknown') {
        if (empId) {
          const empRow = await db.query('SELECT first_name, last_name FROM employees WHERE id = $1', [empId]);
          if (empRow.rows.length) {
            const n = `${empRow.rows[0].first_name} ${empRow.rows[0].last_name}`;
            return res.json({
              reply: `I'm currently looking at ${n}. What would you like to know? I can check their attendance, leave balance, manager, tenure, or generate a full AI briefing.`,
              needsEmployee: false,
            });
          }
        }
        return res.json({
          reply: "I can help with attendance, leave balances, manager lookups, promotion readiness, burnout risk, headcount, turnover, and more. For policies, ask about 'leave policy', 'overtime policy', 'expense policy', or 'attendance policy'. Try one of the suggestion chips, or type what you'd like to check.",
          needsEmployee: false,
        });
      }

      const EMP_INTENTS = ['attendance','balance','policy','manager','tenure','employeeSummary'];
      if (EMP_INTENTS.includes(kind)) {
        if (classified.employeeName) {
          const nameSearch = classified.employeeName.toLowerCase().split(' ');
          let query = 'SELECT id FROM employees WHERE TRUE';
          const params = [];
          nameSearch.forEach((part, i) => {
            params.push(`%${part}%`);
            query += ` AND (lower(first_name) LIKE $${i+1} OR lower(last_name) LIKE $${i+1})`;
          });
          const found = await db.query(query, params);
          if (found.rows.length === 1) {
            empId = found.rows[0].id;
          } else {
            return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
          }
        } else if (!empId) {
          return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
        }
        // empId was passed from frontend context (last selected employee) — use it
      }
    }

    if (needsEmployee && !empId) {
      return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
    }

    const result = await handleIntent(kind, empId);
    if (!result) {
      return res.json({ reply: "I couldn't find the information for that request.", needsEmployee: false });
    }

    const reply = result.aiReply
      ? result.aiReply
      : ORG_WIDE_INTENTS.includes(result.intent)
        ? formatOrgReply(result.intent, result.data)
        : await generateChatReply(result.intent, result.data);

    res.json({ reply, needsEmployee: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
