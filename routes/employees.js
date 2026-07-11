const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/:id/snapshot', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    if (isNaN(empId)) return res.status(400).json({ error: 'Invalid id' });

    const empRes = await db.query(
      `SELECT e.first_name, e.last_name, e.role, e.manager_name,
              e.hire_date, e.role_start_date, e.leave_balance,
              e.performance_rating_met, e.goal_achievement_met,
              e.leadership_cert, e.manager_feedback_positive, e.peer_feedback_positive,
              d.label AS department,
              sg.grade
       FROM employees e
       JOIN departments d ON e.department_id = d.id
       LEFT JOIN salary_grades sg ON e.grade_id = sg.id
       WHERE e.id = $1`,
      [empId]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Not found' });
    const e = empRes.rows[0];

    const attRes = await db.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('present','late')) AS present_late, COUNT(*) AS total
       FROM attendance_records WHERE employee_id = $1`,
      [empId]
    );
    const att = attRes.rows[0];
    const attendancePct = parseInt(att.total) > 0
      ? Math.round(100 * parseInt(att.present_late) / parseInt(att.total))
      : 0;

    const leaveBalance = e.leave_balance ?? null;

    const roleStart = new Date(e.role_start_date || e.hire_date);
    const tenureYears = Math.round((Date.now() - roleStart.getTime()) / (365.25 * 24 * 3600 * 1000) * 10) / 10;

    const metCount = [
      e.performance_rating_met,
      e.goal_achievement_met,
      e.leadership_cert,
      e.manager_feedback_positive && e.peer_feedback_positive,
      tenureYears >= 2,
      attendancePct >= 90,
    ].filter(Boolean).length;

    res.json({
      name: `${e.first_name} ${e.last_name}`,
      role: e.role,
      department: e.department,
      grade: e.grade,
      manager: e.manager_name,
      tenureYears,
      attendancePct,
      leaveBalance,
      promotionScore: Math.round((metCount / 6) * 100),
      promotionReady: metCount >= 5,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
