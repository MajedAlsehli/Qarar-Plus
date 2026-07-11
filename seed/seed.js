require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getWorkingDays(start, end) {
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function generateAttendance(workingDays, targetPct, employeeId) {
  const total = workingDays.length;
  const presentLateTarget = Math.round((targetPct / 100) * total);
  const absentCount = total - presentLateTarget;
  const lateCount = targetPct < 90 ? Math.max(2, Math.round((90 - targetPct) / 5)) : 0;
  const presentCount = presentLateTarget - lateCount;

  const records = workingDays.map((d, i) => {
    let status;
    if (i < presentCount) status = 'present';
    else if (i < presentCount + lateCount) status = 'late';
    else status = 'absent';
    return { date: d.toISOString().split('T')[0], status };
  });

  // Shuffle absent/late/present realistically — spread absences and late throughout
  const shuffled = [...records];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Only shuffle status, not date
    const tmp = shuffled[i].status;
    shuffled[i].status = shuffled[j].status;
    shuffled[j].status = tmp;
  }
  // Keep dates in order
  return workingDays.map((d, i) => ({
    employee_id: employeeId,
    date: d.toISOString().split('T')[0],
    status: shuffled[i].status,
  }));
}

const DEPARTMENTS = [
  { key: 'engineering', label: 'Engineering', manager_name: 'Fahad Mohammed' },
  { key: 'finance', label: 'Finance', manager_name: 'Saad Abdullah' },
  { key: 'itsupport', label: 'IT Support', manager_name: 'Lena Khalid' },
  { key: 'marketing', label: 'Marketing', manager_name: 'Reema Ahmed' },
];

// attendance_pct, tenure_yrs, leave_balance, performance_rating_met, goal_achievement_met,
// leadership_cert, manager_feedback_positive, peer_feedback_positive
const ENGINEERING_EMPLOYEES = [
  { emp_key:'sarah_ahmed', first:'Sarah', last:'Ahmed', role:'Software Engineer', initials:'SA',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'faisal_mohammed', first:'Faisal', last:'Mohammed', role:'Senior Software Engineer', initials:'FM',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'omar_saad', first:'Omar', last:'Saad', role:'Backend Engineer', initials:'OS',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'lama_khalid', first:'Lama', last:'Khalid', role:'Frontend Engineer', initials:'LK',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'turki_fahad', first:'Turki', last:'Fahad', role:'DevOps Engineer', initials:'TF',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'hessa_nasser', first:'Hessa', last:'Nasser', role:'QA Engineer', initials:'HN',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true, grade:'G3' },
  { emp_key:'hassan_sultan', first:'Hassan', last:'Sultan', role:'Data Engineer', initials:'HS',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'rana_waleed', first:'Rana', last:'Waleed', role:'Mobile Engineer', initials:'RW',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'majed_ibrahim', first:'Majed', last:'Ibrahim', role:'Engineering Team Lead', initials:'MI',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'dana_talal', first:'Dana', last:'Talal', role:'Site Reliability Engineer', initials:'DT',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'meshal_abdullah', first:'Meshal', last:'Abdullah', role:'Software Engineer II', initials:'MA',
    att:92, tenure:3.1, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
];

const FINANCE_EMPLOYEES = [
  { emp_key:'layla_mohammed', first:'Layla', last:'Mohammed', role:'Financial Analyst', initials:'LM',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'yousef_abdullah', first:'Yousef', last:'Abdullah', role:'Senior Financial Analyst', initials:'YA',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'noura_ahmed', first:'Noura', last:'Ahmed', role:'Accountant', initials:'NA',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'bandar_khalid', first:'Bandar', last:'Khalid', role:'Payroll Specialist', initials:'BK',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'amal_saad', first:'Amal', last:'Saad', role:'Budget Analyst', initials:'AS',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'nasser_faisal', first:'Nasser', last:'Faisal', role:'Treasury Analyst', initials:'NF',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true, grade:'G3' },
  { emp_key:'wafa_turki', first:'Wafa', last:'Turki', role:'Internal Auditor', initials:'WT',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'ibrahim_nawaf', first:'Ibrahim', last:'Nawaf', role:'Accounts Payable Specialist', initials:'IN',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'munira_hassan', first:'Munira', last:'Hassan', role:'Financial Controller', initials:'MH',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'saud_majed', first:'Saud', last:'Majed', role:'Senior Accountant', initials:'SM',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'rayan_mohammed', first:'Rayan', last:'Mohammed', role:'Finance Coordinator', initials:'RM',
    att:91, tenure:2.4, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
];

const ITSUPPORT_EMPLOYEES = [
  { emp_key:'ahmed_khalid', first:'Ahmed', last:'Khalid', role:'IT Support Specialist', initials:'AK',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'reem_mohammed', first:'Reem', last:'Mohammed', role:'Help Desk Technician', initials:'RM2',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'khalid_sultan', first:'Khalid', last:'Sultan', role:'Systems Administrator', initials:'KS',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'maha_fahad', first:'Maha', last:'Fahad', role:'Network Support Engineer', initials:'MF',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'waleed_saad', first:'Waleed', last:'Saad', role:'IT Support Team Lead', initials:'WS',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'aisha_turki', first:'Aisha', last:'Turki', role:'Desktop Support Analyst', initials:'AT',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true, grade:'G3' },
  { emp_key:'nawaf_hassan', first:'Nawaf', last:'Hassan', role:'IT Security Analyst', initials:'NH',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'rawan_abdullah', first:'Rawan', last:'Abdullah', role:'Service Desk Coordinator', initials:'RA',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'talal_ibrahim', first:'Talal', last:'Ibrahim', role:'Infrastructure Technician', initials:'TI',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'alanoud_majed', first:'Alanoud', last:'Majed', role:'IT Support Engineer', initials:'AM',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'sadeem_ahmed', first:'Sadeem', last:'Ahmed', role:'IT Operations Analyst', initials:'SA2',
    att:93, tenure:2.8, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
];

const MARKETING_EMPLOYEES = [
  { emp_key:'mohammed_saad', first:'Mohammed', last:'Saad', role:'Marketing Specialist', initials:'MS',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'haya_fahad', first:'Haya', last:'Fahad', role:'Digital Marketing Specialist', initials:'HF',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'fares_nasser', first:'Fares', last:'Nasser', role:'Content Marketing Specialist', initials:'FN',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'fatimah_turki', first:'Fatimah', last:'Turki', role:'Marketing Analyst', initials:'FT',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'sultan_waleed', first:'Sultan', last:'Waleed', role:'Social Media Specialist', initials:'SW',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'nada_ahmed', first:'Nada', last:'Ahmed', role:'Marketing Coordinator', initials:'NA2',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true, grade:'G3' },
  { emp_key:'ziyad_ibrahim', first:'Ziyad', last:'Ibrahim', role:'Brand Specialist', initials:'ZI',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'shatha_majed', first:'Shatha', last:'Majed', role:'Growth Marketing Specialist', initials:'SM2',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true, grade:'G3' },
  { emp_key:'abdullah_hassan', first:'Abdullah', last:'Hassan', role:'Marketing Team Lead', initials:'AH',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G4' },
  { emp_key:'jawaher_saud', first:'Jawaher', last:'Saud', role:'SEO Specialist', initials:'JS',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true, grade:'G2' },
  { emp_key:'joud_khalid', first:'Joud', last:'Khalid', role:'Marketing Assistant', initials:'JK',
    att:91, tenure:1.9, lb:8, perf:true, goal:true, cert:false, mfb:true, pfb:true, grade:'G1' },
];

const PERFORMANCE_REVIEWS = {
  sarah_ahmed: "Strong performance on cloud infrastructure projects. Excels at building scalable microservices. Performance consistently above target. Good communicator across teams.",
  faisal_mohammed: "Solid technical work but leadership skills need development. Security review process not always followed. Good problem-solving on data structures and fundamentals.",
  omar_saad: "Cross-functional coordination is strong. Backend API work is solid but REST conventions need improvement. Mentors junior engineers informally.",
  lama_khalid: "Frontend delivery is consistent. Starting to take on infrastructure tasks but needs container orchestration skills. Performance on target.",
  turki_fahad: "Excellent DevOps output. Security best practices occasionally lapse in code reviews. Mentors new hires regularly. Above-target performance.",
  hessa_nasser: "Strong API testing coverage. Cloud deployment work shows potential. Agile ceremonies participation needs improvement. Goals partially met this cycle.",
  hassan_sultan: "Data pipeline work is above target. Leadership potential emerging. Starting Kubernetes container work. Good collaboration across teams.",
  rana_waleed: "Mobile development solid. Performance below target last cycle. Leadership certification not completed. Code reviews show security coding gaps.",
  majed_ibrahim: "Team leadership excellent. Cloud architecture decisions are strong. API design standards need reinforcement across team. Above-target performance.",
  dana_talal: "SRE work is reliable. Leadership potential early-stage. Security practices solid. Needs development in data structure choices for scale.",
  meshal_abdullah: "Consistent contributor on cloud projects. Agile sprint participation is good. API design could improve. Works well with the team.",
  layla_mohammed: "Strong financial modeling work on quarterly forecasts. Increasing exposure to consolidated reporting and IFRS requirements. Good stakeholder presentation skills.",
  yousef_abdullah: "Excellent with Power BI dashboards. Recently took ownership of a new cost center budget. Excel-heavy workflow could be improved with advanced automation.",
  noura_ahmed: "Good accounting fundamentals. Manager feedback highlights an opportunity to present financial findings to non-finance teams more clearly. Audit preparation is growing responsibility.",
  bandar_khalid: "Payroll processing is accurate. IFRS reporting exposure increasing. Excel spreadsheet workflows are manual and time-consuming.",
  amal_saad: "Budget management is strong. Expanded into corporate tax and risk areas. Power BI adoption would streamline reporting. Performance above target.",
  nasser_faisal: "Treasury analysis is reliable. Risk management gaps identified during last audit prep. Stakeholder communication needs improvement for presenting to non-finance audiences.",
  wafa_turki: "Internal audit work is thorough. Excel-heavy workflows need modernization. Power BI could streamline the monthly reporting burden significantly.",
  ibrahim_nawaf: "Accounts payable processes are efficient. Has started taking on tax-related tasks without formal training. Stakeholder communication is a growth area.",
  munira_hassan: "Financial controlling is excellent. Leads IFRS compliance reviews. Strong risk management skills. Performance consistently above target.",
  saud_majed: "Senior accounting work is improving. Power BI training started. Budget tracking for new cost center has expanded scope recently.",
  rayan_mohammed: "Finance coordination role is expanding. Excel and reporting workflows are manual. Good team collaboration and meeting facilitation skills.",
  ahmed_khalid: "IT support quality is high. Ticket resolution time above target particularly on Tier-2 issues. Network security incidents increasing in volume.",
  reem_mohammed: "Help desk performance is solid. Incident update communication to end users needs improvement. Cloud-hosted system support requests are growing.",
  khalid_sultan: "Systems administration is strong. ITIL framework knowledge would improve service management approach. Technical documentation quality is inconsistent.",
  maha_fahad: "Network support is reliable. Security-related tickets increasing beyond current training. Account provisioning tasks now part of the role.",
  waleed_saad: "Team leadership excellent. Cloud infrastructure knowledge needs updating as support volume shifts. Technical documentation and knowledge base articles need consistency.",
  aisha_turki: "Desktop support is steady. Handles high volume of concurrent tickets. Incident prioritization and structured management would help throughput. ITIL certification path fits career goals.",
  nawaf_hassan: "Security analysis work is solid. Active Directory administration tasks increasing. Customer communication during incidents could be clearer.",
  rawan_abdullah: "Service desk coordination improving. Technical documentation is inconsistent. ITIL foundations would help structure the team's service delivery. Cloud requests growing.",
  talal_ibrahim: "Infrastructure work is excellent. Ticket resolution for network and security incidents is effective. Incident management documentation could be more structured.",
  alanoud_majed: "IT support quality is developing. Customer communication during incidents needs work. Cloud infrastructure requests require additional knowledge. Active Directory work is new.",
  sadeem_ahmed: "Operations analysis is solid. Documentation quality is improving. Incident management processes are being adopted. Good team player.",
  mohammed_saad: "Campaign management is strong. Digital analytics and SEO overlap with recent projects is growing. Brand positioning work increasing.",
  haya_fahad: "Digital marketing execution is solid. Campaign planning and content strategy are areas for growth. Marketing automation adoption would reduce manual setup time.",
  fares_nasser: "Content creation quality is high. Brand positioning involvement has increased. Presentation skills in leadership reviews need sharpening.",
  fatimah_turki: "Marketing analysis is reliable. SEO and paid search overlap with current projects. Social media performance reporting is currently manual.",
  sultan_waleed: "Social media strategy is excellent. Campaign automation would reduce manual setup significantly. Content planning and copywriting quality needs reinforcement.",
  nada_ahmed: "Marketing coordination is steady. Brand-level decisions are increasing but framework knowledge is limited. Campaign analytics measurement needs improvement.",
  ziyad_ibrahim: "Brand work is developing. Social media analytics reporting is manual. Content strategy knowledge would support the transition to campaign planning.",
  shatha_majed: "Growth marketing shows promise. Copywriting and messaging clarity flagged by manager. Presentation and storytelling in leadership reviews needs work.",
  abdullah_hassan: "Marketing leadership is strong. Campaign analytics and SEO integration with brand strategy are priorities. Brand positioning frameworks well understood.",
  jawaher_saud: "SEO work is solid. Content strategy and marketing automation adoption would expand effectiveness. Social media analytics reporting is manual.",
  joud_khalid: "Marketing assistant duties handled well. Learning digital campaign analytics. Content planning and brand positioning knowledge is early stage.",
};

// Request templates per employee type (based on recentRequest in prototype)
const REQUEST_TEMPLATES = {
  // By attendance group: 97%,96%,98%=pending leave 2d ago; 95%=overtime policy check; 81%,79%=expense ready; 93%=approved leave; 90%=overtime policy; 94%=approved leave; 88%=overtime policy
  pending_leave: { type:'leave', status:'pending', daysAgo:2 },
  overtime_policy: { type:'overtime', status:'needs_policy_check', daysAgo:2 },
  expense_ready: { type:'expense', status:'ready', daysAgo:1 },
  approved_leave: { type:'leave', status:'approved', daysAgo:5 },
};

function getRequestTemplate(att) {
  if (att === 97 || att === 96 || att === 98) return 'pending_leave';
  if (att === 95 || att === 90 || att === 88) return 'overtime_policy';
  if (att === 81 || att === 79) return 'expense_ready';
  if (att === 93 || att === 94) return 'approved_leave';
  return 'pending_leave';
}

const COURSES = {
  engineering: [
    { title:'Advanced Cloud Computing', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'A hands-on course covering scalable cloud architecture, deployment automation, and cost optimization for production systems.' },
    { title:'Leadership Fundamentals', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'An introduction to core leadership skills including delegation, feedback, and managing cross-functional priorities.' },
    { title:'Agile Project Management', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers agile ceremonies, sprint planning, and backlog management for engineers coordinating cross-functional work.' },
    { title:'Kubernetes & Container Orchestration', level:'Advanced', duration:'9 hours', format:'Self-paced online', description:'Covers container orchestration, scaling strategies, and production deployment patterns using Kubernetes.' },
    { title:'Secure Coding Practices', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers common vulnerability patterns and secure-by-design coding practices for modern application development.' },
    { title:'API Design Best Practices', level:'Intermediate', duration:'4 hours', format:'Self-paced online', description:'Covers REST and API versioning conventions, documentation standards, and designing for long-term maintainability.' },
    { title:'Data Structures for Scale', level:'Advanced', duration:'7 hours', format:'Self-paced online', description:'Covers advanced data structure selection and performance trade-offs for high-throughput systems.' },
    { title:'Technical Mentorship Skills', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers structured approaches to mentoring junior engineers, including code review feedback and onboarding support.' },
    { title:'System Design Fundamentals', level:'Advanced', duration:'10 hours', format:'Self-paced online', description:'Covers designing scalable distributed systems including load balancing, caching, and database sharding strategies.' },
    { title:'CI/CD Pipeline Mastery', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers building automated build, test, and deployment pipelines using modern DevOps tooling.' },
    { title:'Code Review Best Practices', level:'Intermediate', duration:'4 hours', format:'Self-paced online', description:'Covers giving and receiving effective code reviews, maintaining standards, and building a healthy review culture.' },
    { title:'Python for Data Engineering', level:'Intermediate', duration:'8 hours', format:'Self-paced online', description:'Covers Python scripting for data pipelines, automation, and ETL workflows in engineering environments.' },
    { title:'Cloud Security Architecture', level:'Advanced', duration:'7 hours', format:'Self-paced online', description:'Covers securing cloud infrastructure, identity and access management, and compliance for production environments.' },
  ],
  finance: [
    { title:'Advanced Financial Modeling', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'Covers scenario modeling, sensitivity analysis, and building forecast models for complex business decisions.' },
    { title:'Data Analysis with Power BI', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers building dashboards, automating recurring reports, and visualizing financial data using Power BI.' },
    { title:'Stakeholder Communication', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers presenting financial data clearly to non-financial audiences and structuring persuasive summaries.' },
    { title:'IFRS Reporting Standards', level:'Advanced', duration:'7 hours', format:'Self-paced online', description:'Covers core IFRS principles and their practical application in consolidated financial reporting.' },
    { title:'Budgeting & Forecasting', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers building operating budgets, variance analysis, and rolling forecast techniques.' },
    { title:'Risk Management Fundamentals', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers structured risk identification, assessment frameworks, and audit preparation practices.' },
    { title:'Excel for Finance Professionals', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers advanced formulas, pivot tables, and automation techniques for finance reporting workflows.' },
    { title:'Corporate Tax Essentials', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers core corporate tax principles and compliance considerations relevant to day-to-day finance work.' },
    { title:'Financial Statement Analysis', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers reading and interpreting income statements, balance sheets, and cash flow statements for business decisions.' },
    { title:'SAP Finance Essentials', level:'Intermediate', duration:'7 hours', format:'Self-paced online', description:'Covers core SAP FI module workflows including general ledger, accounts payable, and financial reporting.' },
    { title:'Compliance & Regulatory Frameworks', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers financial compliance requirements, regulatory reporting obligations, and internal control frameworks.' },
    { title:'Negotiation Skills for Finance', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers negotiation techniques for vendor contracts, budget approvals, and cross-functional finance discussions.' },
    { title:'Financial Risk Modeling', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'Covers quantitative risk modeling techniques including value-at-risk, scenario analysis, and stress testing.' },
  ],
  itsupport: [
    { title:'Advanced Troubleshooting Techniques', level:'Advanced', duration:'6 hours', format:'Self-paced online', description:'Covers systematic diagnostic approaches for complex, recurring, and hard-to-reproduce technical issues.' },
    { title:'Customer Communication Skills', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers clear, empathetic communication techniques for updating end users during technical incidents.' },
    { title:'ITIL Foundations', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers core ITIL service management concepts including incident, problem, and change management.' },
    { title:'Network Security Essentials', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers core network security concepts including access control, VPNs, and common attack vectors.' },
    { title:'Cloud Infrastructure Basics', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers foundational cloud infrastructure concepts for supporting hybrid on-premise and cloud environments.' },
    { title:'Incident Management Best Practices', level:'Intermediate', duration:'4 hours', format:'Self-paced online', description:'Covers prioritization frameworks and structured workflows for managing concurrent support incidents.' },
    { title:'Active Directory Administration', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers user and group provisioning, permissions structures, and everyday AD administration tasks.' },
    { title:'Technical Documentation Writing', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers structuring clear, consistent internal documentation and knowledge-base articles.' },
    { title:'Cybersecurity Fundamentals', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers core cybersecurity concepts including threat detection, endpoint protection, and security best practices.' },
    { title:'PowerShell Scripting for IT', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers automating IT administration tasks using PowerShell scripting and task scheduling.' },
    { title:'Virtualization with VMware', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'Covers setting up and managing virtual machines, hypervisors, and virtual networking with VMware.' },
    { title:'Remote Support Best Practices', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers tools and techniques for delivering effective remote IT support and troubleshooting.' },
    { title:'IT Project Management', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers planning and delivering IT projects on time including scope management, risk tracking, and stakeholder updates.' },
  ],
  marketing: [
    { title:'Digital Campaign Analytics', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers measurement frameworks, attribution basics, and analyzing paid campaign performance.' },
    { title:'Content Strategy Fundamentals', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers planning content calendars, audience segmentation, and aligning content with campaign goals.' },
    { title:'Presentation & Storytelling Skills', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers structuring persuasive presentations and communicating marketing results to leadership.' },
    { title:'SEO & SEM Fundamentals', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers organic search optimization and paid search campaign fundamentals.' },
    { title:'Marketing Automation Tools', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers setting up automated campaign workflows and reducing manual campaign configuration work.' },
    { title:'Brand Positioning Strategy', level:'Advanced', duration:'6 hours', format:'Self-paced online', description:'Covers frameworks for defining brand positioning and aligning campaigns with long-term brand strategy.' },
    { title:'Social Media Analytics', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers tracking and interpreting social performance metrics across major platforms.' },
    { title:'Copywriting for Marketers', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers writing clear, persuasive marketing copy across channels and campaign types.' },
    { title:'Email Marketing Strategy', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers building email campaigns, segmentation strategies, and optimizing open and conversion rates.' },
    { title:'Customer Journey Mapping', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers mapping end-to-end customer experiences, identifying friction points, and aligning campaigns to journey stages.' },
    { title:'Video Content Production', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers planning, shooting, and editing short-form video content for social media and digital campaigns.' },
    { title:'Market Research Methods', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers qualitative and quantitative research techniques for understanding audience needs and market positioning.' },
    { title:'Growth Hacking Fundamentals', level:'Advanced', duration:'6 hours', format:'Self-paced online', description:'Covers data-driven growth strategies including A/B testing, funnel optimization, and rapid experimentation frameworks.' },
  ],
};

const SALARY_GRADES = [
  { grade:'G1', label:'Entry Level',           min:5000,  max:8000  },
  { grade:'G2', label:'Associate',             min:8000,  max:12000 },
  { grade:'G3', label:'Professional',          min:12000, max:18000 },
  { grade:'G4', label:'Senior Professional',   min:18000, max:28000 },
  { grade:'G5', label:'Principal / Lead',      min:28000, max:45000 },
];

const HR_POLICIES = [
  { category:'leave',       title:'Annual Leave Entitlement',         effective:'2024-01-01',
    summary:'21 working days for under 5 years; 30 days for 5+ years.',
    full_text:'Employees with fewer than 5 years of continuous service are entitled to 21 working days of paid annual leave per calendar year. Employees with 5 or more years of service are entitled to 30 working days. Leave must be approved by the direct manager at least one week in advance. Unused leave of up to 10 days may be carried over to the following year.' },
  { category:'leave',       title:'Sick Leave Policy',                effective:'2024-01-01',
    summary:'30 days paid sick leave per year; unpaid thereafter.',
    full_text:'Employees are entitled to 30 calendar days of paid sick leave per year. Days 31–90 are paid at 75%. Beyond 90 days the leave is unpaid. A medical certificate is required for absences exceeding two consecutive days. Sick leave cannot be taken immediately before or after annual leave without a medical certificate.' },
  { category:'leave',       title:'Maternity Leave',                  effective:'2024-01-01',
    summary:'10 weeks full pay for female employees.',
    full_text:'Female employees are entitled to 10 weeks of paid maternity leave, to be taken around the expected date of delivery. The employee must notify HR at least one month before the expected start date. An additional 4 weeks of unpaid leave may be requested with manager approval. Maternity leave does not affect accrual of annual leave.' },
  { category:'leave',       title:'Paternity Leave',                  effective:'2024-01-01',
    summary:'3 days paid paternity leave.',
    full_text:'Male employees are entitled to 3 days of paid paternity leave following the birth of a child. Leave must be taken within 30 days of the birth. Requests must be submitted to HR and manager prior to or immediately after the birth.' },
  { category:'leave',       title:'Emergency Leave',                  effective:'2024-01-01',
    summary:'3 days per year for immediate family emergencies.',
    full_text:'Employees may take up to 3 days of paid emergency leave per year for immediate family emergencies including bereavement (first-degree relatives), serious illness of a dependent, or critical domestic incidents. Emergency leave must be reported to the manager as soon as possible and documented within 48 hours.' },
  { category:'overtime',    title:'Overtime Approval Policy',         effective:'2024-01-01',
    summary:'All overtime must be pre-approved by manager; 1.5x rate weekdays, 2x weekends.',
    full_text:'Overtime work must be pre-approved in writing by the employee\'s direct manager before hours are worked. Overtime on weekdays is compensated at 1.5x the base hourly rate. Overtime on weekends and public holidays is compensated at 2x the base hourly rate. Overtime claims must be submitted within 7 days of the work being performed.' },
  { category:'overtime',    title:'Overtime Cap',                     effective:'2024-01-01',
    summary:'Maximum 20 hours per month; VP approval required above this.',
    full_text:'No employee may work more than 20 overtime hours per calendar month without written approval from their department VP. HR must be notified when an employee reaches 15 hours of overtime in a month. Employees regularly exceeding the cap will be reviewed for workload redistribution or headcount addition.' },
  { category:'expense',     title:'Expense Claims Policy',            effective:'2024-01-01',
    summary:'Claims must be submitted within 30 days; receipts required over SAR 200.',
    full_text:'All expense claims must be submitted within 30 calendar days of the expenditure. Original receipts or electronic invoices are required for any single expense exceeding SAR 200. Reimbursable categories include travel, accommodation, client entertainment (pre-approved), and role-specific equipment. Claims are reviewed and processed within 10 business days of submission.' },
  { category:'expense',     title:'Travel and Accommodation',         effective:'2024-01-01',
    summary:'Economy class for domestic; business class for international flights over 5 hours.',
    full_text:'Business travel must be pre-approved by the direct manager and booked through the company travel portal. Domestic flights are economy class. International flights exceeding 5 hours are eligible for business class with VP approval. Hotel accommodation is capped at SAR 800 per night domestically and SAR 1,500 per night internationally.' },
  { category:'attendance',  title:'Core Working Hours',               effective:'2024-01-01',
    summary:'Core hours are 9:00am–4:00pm; flexible outside these hours with manager approval.',
    full_text:'All employees are expected to be present and available during core hours of 9:00am to 4:00pm Sunday through Thursday. Flexible arrangements outside core hours may be agreed with the direct manager. Attendance is tracked via the HR system. Unapproved absences during core hours are recorded as late or absent.' },
  { category:'attendance',  title:'Late Arrival Policy',             effective:'2024-01-01',
    summary:'3 or more late arrivals per month triggers an HR review.',
    full_text:'Arriving more than 15 minutes after the start of core hours constitutes a late arrival. Two late arrivals per month generate an automatic alert to the manager. Three or more late arrivals in a calendar month trigger a formal HR review meeting. Persistent lateness may result in disciplinary action under the Disciplinary Process Policy.' },
  { category:'attendance',  title:'Remote Work Policy',               effective:'2024-01-01',
    summary:'Up to 2 days per week remote with manager approval.',
    full_text:'Employees may work remotely for up to 2 days per calendar week with prior approval from their direct manager. Remote work is subject to role suitability and business needs. Employees on performance improvement plans are not eligible for remote work without explicit HR approval. Attendance tracking applies equally to remote days.' },
  { category:'hr',          title:'Probation Period',                 effective:'2024-01-01',
    summary:'90-day probation for new hires; 1-week notice during probation.',
    full_text:'All new employees serve a 90-day probationary period beginning on their first day of employment. During probation, either party may terminate the employment relationship with 1 week\'s written notice. Performance is reviewed at 30, 60, and 90 days. Successful completion of probation is confirmed in writing by HR.' },
  { category:'hr',          title:'Promotion Policy',                 effective:'2024-01-01',
    summary:'Minimum 2 years in role; all 5 criteria must be met; leadership cert required.',
    full_text:'Employees are eligible for promotion consideration after a minimum of 2 years in their current role. All five promotion criteria must be satisfied: performance rating met, goal achievement met, leadership certification completed, positive manager feedback, and positive peer feedback. Promotions are reviewed in the Q2 and Q4 cycles. The decision rests with the department head and HR.' },
  { category:'hr',          title:'Performance Improvement Plan',     effective:'2024-01-01',
    summary:'Triggered after 2 consecutive underperforming quarters; 90-day PIP period.',
    full_text:'A Performance Improvement Plan (PIP) is initiated when an employee receives unsatisfactory performance ratings in two consecutive review cycles. The PIP runs for 90 days with defined measurable targets. Weekly check-ins are conducted by the manager and HR. Failure to meet PIP targets may result in termination. Successful completion closes the PIP and resets the review cycle.' },
  { category:'hr',          title:'Disciplinary Process',             effective:'2024-01-01',
    summary:'Verbal warning → written warning → final written warning → termination.',
    full_text:'The disciplinary process follows four progressive stages: verbal warning, written warning, final written warning, and termination. Each stage is documented and signed by the manager, HR, and the employee. Gross misconduct may result in immediate termination without prior warning stages. Employees have the right to respond in writing at each stage.' },
  { category:'hr',          title:'Notice Period',                    effective:'2024-01-01',
    summary:'30 days for under 2 years of service; 60 days for 2+ years.',
    full_text:'Employees with fewer than 2 years of service are required to give 30 calendar days\' notice of resignation. Employees with 2 or more years of service must give 60 calendar days\' notice. Notice must be submitted in writing to the manager and HR. The company reserves the right to waive the notice period and pay in lieu of notice.' },
  { category:'hr',          title:'Training and Development Budget',  effective:'2024-01-01',
    summary:'SAR 3,000 per employee per year for approved external training.',
    full_text:'Each employee is allocated SAR 3,000 per calendar year for external training, certifications, and development activities. Requests must be submitted to HR and approved by the direct manager before enrollment. Training must be relevant to the employee\'s current role or agreed development plan. Reimbursement is processed on completion of the training and submission of receipts.' },
];

const OVERTIME_DATA = [
  { key:'omar_saad',      month:'2026-05', hours:22, approvedBy:'Fahad Mohammed' },
  { key:'omar_saad',      month:'2026-06', hours:19, approvedBy:'Fahad Mohammed' },
  { key:'omar_saad',      month:'2026-07', hours:14, approvedBy:'Fahad Mohammed' },
  { key:'hassan_sultan',  month:'2026-05', hours:24, approvedBy:'Fahad Mohammed' },
  { key:'hassan_sultan',  month:'2026-06', hours:21, approvedBy:'Fahad Mohammed' },
  { key:'hassan_sultan',  month:'2026-07', hours:18, approvedBy:'Fahad Mohammed' },
  { key:'noura_ahmed',    month:'2026-05', hours:20, approvedBy:'Saad Abdullah' },
  { key:'noura_ahmed',    month:'2026-06', hours:23, approvedBy:'Saad Abdullah' },
  { key:'noura_ahmed',    month:'2026-07', hours:16, approvedBy:'Saad Abdullah' },
  { key:'wafa_turki',     month:'2026-05', hours:17, approvedBy:'Saad Abdullah' },
  { key:'wafa_turki',     month:'2026-06', hours:25, approvedBy:'Saad Abdullah' },
  { key:'wafa_turki',     month:'2026-07', hours:20, approvedBy:'Saad Abdullah' },
  { key:'khalid_sultan',  month:'2026-05', hours:18, approvedBy:'Lena Khalid' },
  { key:'khalid_sultan',  month:'2026-06', hours:22, approvedBy:'Lena Khalid' },
  { key:'khalid_sultan',  month:'2026-07', hours:15, approvedBy:'Lena Khalid' },
  { key:'nawaf_hassan',   month:'2026-05', hours:21, approvedBy:'Lena Khalid' },
  { key:'nawaf_hassan',   month:'2026-06', hours:19, approvedBy:'Lena Khalid' },
  { key:'nawaf_hassan',   month:'2026-07', hours:17, approvedBy:'Lena Khalid' },
  { key:'fares_nasser',   month:'2026-05', hours:16, approvedBy:'Reema Ahmed' },
  { key:'fares_nasser',   month:'2026-06', hours:20, approvedBy:'Reema Ahmed' },
  { key:'fares_nasser',   month:'2026-07', hours:13, approvedBy:'Reema Ahmed' },
  { key:'ziyad_ibrahim',  month:'2026-05', hours:23, approvedBy:'Reema Ahmed' },
  { key:'ziyad_ibrahim',  month:'2026-06', hours:18, approvedBy:'Reema Ahmed' },
  { key:'ziyad_ibrahim',  month:'2026-07', hours:22, approvedBy:'Reema Ahmed' },
];

const TRAINING_COMPLETIONS = [
  { key:'sarah_ahmed',      course:'Advanced Cloud Computing',         date:'2025-11-15', score:92 },
  { key:'sarah_ahmed',      course:'Secure Coding Practices',          date:'2026-02-20', score:88 },
  { key:'turki_fahad',      course:'Cloud Security Architecture',      date:'2025-10-08', score:95 },
  { key:'turki_fahad',      course:'CI/CD Pipeline Mastery',           date:'2026-03-14', score:91 },
  { key:'majed_ibrahim',    course:'Leadership Fundamentals',          date:'2025-09-22', score:89 },
  { key:'majed_ibrahim',    course:'Agile Project Management',         date:'2026-01-10', score:93 },
  { key:'layla_mohammed',   course:'Advanced Financial Modeling',      date:'2025-11-05', score:90 },
  { key:'amal_saad',        course:'Budgeting & Forecasting',          date:'2025-12-12', score:94 },
  { key:'munira_hassan',    course:'IFRS Reporting Standards',         date:'2025-10-30', score:97 },
  { key:'waleed_saad',      course:'ITIL Foundations',                 date:'2025-11-18', score:85 },
  { key:'waleed_saad',      course:'IT Project Management',            date:'2026-04-05', score:88 },
  { key:'talal_ibrahim',    course:'Advanced Troubleshooting Techniques', date:'2025-12-03', score:91 },
  { key:'sultan_waleed',    course:'Digital Campaign Analytics',       date:'2025-10-14', score:86 },
  { key:'sultan_waleed',    course:'Brand Positioning Strategy',       date:'2026-02-28', score:90 },
  { key:'abdullah_hassan',  course:'Brand Positioning Strategy',       date:'2025-09-15', score:93 },
  { key:'ahmed_khalid',     course:'Network Security Essentials',      date:'2026-01-22', score:87 },
  { key:'lama_khalid',      course:'Kubernetes & Container Orchestration', date:'2026-05-10', score:84 },
  { key:'yousef_abdullah',  course:'Data Analysis with Power BI',      date:'2026-03-07', score:88 },
];

const DISCIPLINARY_DATA = [
  { key:'rana_waleed',     type:'written_warning',  reason:'Performance below target for two consecutive review cycles.',             date:'2025-12-01', by:'Fahad Mohammed' },
  { key:'ibrahim_nawaf',   type:'written_warning',  reason:'Repeated failure to meet quarterly performance targets.',                 date:'2026-01-15', by:'Saad Abdullah' },
  { key:'rawan_abdullah',  type:'verbal_warning',   reason:'Inconsistent documentation quality and missed service-level targets.',    date:'2026-02-10', by:'Lena Khalid' },
  { key:'aisha_turki',     type:'verbal_warning',   reason:'Goal achievement gaps and manager feedback below threshold.',              date:'2026-01-20', by:'Lena Khalid' },
  { key:'nasser_faisal',   type:'verbal_warning',   reason:'Failed to meet stakeholder communication targets for two quarters.',      date:'2025-11-05', by:'Saad Abdullah' },
  { key:'nada_ahmed',      type:'verbal_warning',   reason:'Below-target goal achievement; manager feedback indicates development gaps.', date:'2026-02-25', by:'Reema Ahmed' },
  { key:'hassan_sultan',   type:'pip',              reason:'Sustained late-attendance pattern and workload concerns. PIP active.',    date:'2026-03-01', by:'Fahad Mohammed' },
  { key:'wafa_turki',      type:'pip',              reason:'Attendance below acceptable threshold and repeated overtime breaches.',   date:'2026-03-15', by:'Saad Abdullah' },
  { key:'sarah_ahmed',     type:'commendation',     reason:'Outstanding delivery on Q3 cloud migration project ahead of schedule.',   date:'2025-10-01', by:'Fahad Mohammed' },
  { key:'turki_fahad',     type:'commendation',     reason:'Exceptional work establishing the new CI/CD pipeline across all teams.',  date:'2025-11-20', by:'Fahad Mohammed' },
  { key:'majed_ibrahim',   type:'commendation',     reason:'Recognised for mentoring 3 engineers and improving team velocity by 22%.', date:'2026-01-08', by:'Fahad Mohammed' },
  { key:'amal_saad',       type:'commendation',     reason:'Led the annual budgeting cycle on time with zero revision requests.',     date:'2025-12-10', by:'Saad Abdullah' },
  { key:'munira_hassan',   type:'commendation',     reason:'IFRS compliance review completed with zero audit findings.',              date:'2026-02-14', by:'Saad Abdullah' },
  { key:'waleed_saad',     type:'commendation',     reason:'Reduced average ticket resolution time by 31% in Q4 2025.',              date:'2026-01-15', by:'Lena Khalid' },
  { key:'sultan_waleed',   type:'commendation',     reason:'Social media campaign exceeded engagement targets by 40% in Q1 2026.',   date:'2026-04-05', by:'Reema Ahmed' },
  { key:'abdullah_hassan', type:'commendation',     reason:'Successfully launched brand refresh campaign across all channels.',       date:'2026-03-20', by:'Reema Ahmed' },
];

const HEADCOUNT_REQUESTS = [
  { dept:'engineering', role:'Senior Backend Engineer',        grade:'G4', status:'approved',
    justification:'Growing API workload requires dedicated senior backend capacity.',
    requestedBy:'Majed Ibrahim', requestedDate:'2026-05-01' },
  { dept:'engineering', role:'Software Engineer',              grade:'G3', status:'pending',
    justification:'Team velocity impacted by current headcount gaps post Q1 exits.',
    requestedBy:'Majed Ibrahim', requestedDate:'2026-06-10' },
  { dept:'finance', role:'Financial Analyst',                  grade:'G3', status:'approved',
    justification:'Increased reporting requirements for consolidated IFRS filings.',
    requestedBy:'Munira Hassan', requestedDate:'2026-04-15' },
  { dept:'itsupport', role:'IT Security Analyst',              grade:'G3', status:'pending',
    justification:'Rising security incident volume exceeds current team capacity.',
    requestedBy:'Waleed Saad', requestedDate:'2026-06-01' },
  { dept:'itsupport', role:'Help Desk Technician',             grade:'G2', status:'approved',
    justification:'Headcount needed to maintain SLAs during planned leave periods.',
    requestedBy:'Waleed Saad', requestedDate:'2026-05-20' },
  { dept:'marketing', role:'Digital Marketing Manager',        grade:'G4', status:'pending',
    justification:'Campaign complexity and volume requires senior campaign ownership.',
    requestedBy:'Abdullah Hassan', requestedDate:'2026-06-15' },
  { dept:'marketing', role:'Content Marketing Specialist',     grade:'G3', status:'rejected',
    justification:'New content calendar demands additional full-time capacity.',
    requestedBy:'Abdullah Hassan', requestedDate:'2026-03-10' },
];

const EXIT_RECORDS = [
  { name:'Khaled Al-Rasheed',  role:'Software Engineer',          dept:'Engineering',  date:'2026-03-31', type:'resignation',        tenure:2.1, reason:'Accepted external offer with higher compensation.' },
  { name:'Sara Al-Mutairi',    role:'Financial Analyst',          dept:'Finance',      date:'2026-02-28', type:'resignation',        tenure:1.8, reason:'Relocated to another city following family circumstances.' },
  { name:'Abdullah Al-Zahrani',role:'Help Desk Technician',       dept:'IT Support',   date:'2026-04-15', type:'termination',        tenure:0.9, reason:'Terminated following disciplinary process for misconduct.' },
  { name:'Nora Al-Dosari',     role:'Marketing Coordinator',      dept:'Marketing',    date:'2026-01-31', type:'resignation',        tenure:3.2, reason:'Career change to a different industry.' },
  { name:'Fahad Al-Harbi',     role:'Backend Engineer',           dept:'Engineering',  date:'2025-12-31', type:'mutual_agreement',   tenure:4.5, reason:'Role eliminated following team restructuring.' },
  { name:'Lina Al-Ghamdi',     role:'Treasury Analyst',           dept:'Finance',      date:'2026-05-15', type:'resignation',        tenure:2.7, reason:'Pursuing postgraduate studies full-time.' },
  { name:'Waleed Al-Enazi',    role:'IT Support Specialist',      dept:'IT Support',   date:'2026-06-30', type:'resignation',        tenure:1.4, reason:'Moved to competitor with better career progression.' },
  { name:'Reem Al-Shehri',     role:'Brand Specialist',           dept:'Marketing',    date:'2026-04-30', type:'resignation',        tenure:3.8, reason:'Accepted a senior role at a larger organisation.' },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await client.query(schema);

    console.log('Clearing existing data...');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM recommendations');
    await client.query('DELETE FROM performance_reviews');
    await client.query('DELETE FROM requests');
    await client.query('DELETE FROM attendance_records');
    await client.query('DELETE FROM courses');
    await client.query('DELETE FROM exit_records');
    await client.query('DELETE FROM headcount_requests');
    await client.query('DELETE FROM disciplinary_records');
    await client.query('DELETE FROM training_completions');
    await client.query('DELETE FROM overtime_records');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM salary_grades');
    await client.query('DELETE FROM hr_policies');
    await client.query('DELETE FROM departments');

    console.log('Seeding salary grades...');
    const gradeIds = {};
    for (const g of SALARY_GRADES) {
      const r = await client.query(
        'INSERT INTO salary_grades (grade, label, min_salary, max_salary) VALUES ($1,$2,$3,$4) RETURNING id',
        [g.grade, g.label, g.min, g.max]
      );
      gradeIds[g.grade] = r.rows[0].id;
    }

    console.log('Seeding HR policies...');
    for (const p of HR_POLICIES) {
      await client.query(
        'INSERT INTO hr_policies (category, title, summary, full_text, effective_date) VALUES ($1,$2,$3,$4,$5)',
        [p.category, p.title, p.summary, p.full_text, p.effective]
      );
    }

    console.log('Seeding departments...');
    const deptIds = {};
    for (const d of DEPARTMENTS) {
      const r = await client.query(
        'INSERT INTO departments (key, label, manager_name) VALUES ($1,$2,$3) RETURNING id',
        [d.key, d.label, d.manager_name]
      );
      deptIds[d.key] = r.rows[0].id;
    }

    console.log('Seeding courses...');
    const courseIds = {};
    for (const [deptKey, courses] of Object.entries(COURSES)) {
      courseIds[deptKey] = {};
      for (const c of courses) {
        const r = await client.query(
          'INSERT INTO courses (title, department_key, level, duration, format, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [c.title, deptKey, c.level, c.duration, c.format, c.description]
        );
        courseIds[deptKey][c.title] = r.rows[0].id;
      }
    }

    const today = new Date('2026-07-10');
    const q3Start = new Date('2025-07-01');
    const q3End = new Date('2025-09-30');
    const jul2026Start = new Date('2026-07-01');
    const jul2026End = new Date('2026-07-09');
    const q3Days = getWorkingDays(q3Start, q3End);
    const jul2026Days = getWorkingDays(jul2026Start, jul2026End);

    const ALL_EMPLOYEES = [
      ...ENGINEERING_EMPLOYEES.map(e => ({ ...e, dept:'engineering' })),
      ...FINANCE_EMPLOYEES.map(e => ({ ...e, dept:'finance' })),
      ...ITSUPPORT_EMPLOYEES.map(e => ({ ...e, dept:'itsupport' })),
      ...MARKETING_EMPLOYEES.map(e => ({ ...e, dept:'marketing' })),
    ];

    const empIds = {};
    console.log('Seeding employees, attendance, requests, and reviews...');

    for (const emp of ALL_EMPLOYEES) {
      const roleStart = new Date(today);
      roleStart.setFullYear(roleStart.getFullYear() - Math.floor(emp.tenure));
      const dayFraction = (emp.tenure % 1) * 365;
      roleStart.setDate(roleStart.getDate() - Math.round(dayFraction));

      const hireDate = new Date(roleStart);
      hireDate.setMonth(hireDate.getMonth() - 3);

      const deptManagerMap = { engineering:'Fahad Mohammed', finance:'Saad Abdullah', itsupport:'Lena Khalid', marketing:'Reema Ahmed' };
      const managerName = deptManagerMap[emp.dept];

      const empR = await client.query(
        `INSERT INTO employees (emp_key, first_name, last_name, role, department_id, grade_id, manager_name, initials,
           hire_date, role_start_date, leave_balance, leadership_cert, performance_rating_met,
           goal_achievement_met, manager_feedback_positive, peer_feedback_positive)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [
          emp.emp_key, emp.first, emp.last, emp.role, deptIds[emp.dept], gradeIds[emp.grade || 'G2'], managerName, emp.initials,
          hireDate.toISOString().split('T')[0],
          roleStart.toISOString().split('T')[0],
          emp.lb, emp.cert, emp.perf, emp.goal, emp.mfb, emp.pfb,
        ]
      );
      const empId = empR.rows[0].id;
      empIds[emp.emp_key] = empId;

      // Q3 2025 attendance
      const attRecords = generateAttendance(q3Days, emp.att, empId);
      for (const ar of attRecords) {
        await client.query(
          'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
          [empId, ar.date, ar.status]
        );
      }

      // July 2026 attendance — give late records to employees with <90% attendance
      if (emp.att < 90) {
        const lateCount = emp.att < 82 ? 3 : 2;
        for (let i = 0; i < jul2026Days.length; i++) {
          const status = i < lateCount ? 'late' : 'present';
          await client.query(
            'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
            [empId, jul2026Days[i].toISOString().split('T')[0], status]
          );
        }
      } else {
        // present in July 2026
        for (const d of jul2026Days) {
          await client.query(
            'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
            [empId, d.toISOString().split('T')[0], 'present']
          );
        }
      }

      // Requests
      const reqKey = getRequestTemplate(emp.att);
      const tmpl = REQUEST_TEMPLATES[reqKey];
      const submittedAt = new Date(today);
      submittedAt.setDate(submittedAt.getDate() - tmpl.daysAgo);
      await client.query(
        'INSERT INTO requests (employee_id, type, submitted_at, status) VALUES ($1,$2,$3,$4)',
        [empId, tmpl.type, submittedAt.toISOString(), tmpl.status]
      );

      // Performance review
      const notes = PERFORMANCE_REVIEWS[emp.emp_key] || `${emp.first} ${emp.last} is a valued team member with solid performance this quarter.`;
      await client.query(
        'INSERT INTO performance_reviews (employee_id, cycle, notes) VALUES ($1,$2,$3)',
        [empId, 'Q3 2025', notes]
      );
    }

    // Override specific QUEUE_PEOPLE requests to match the prototype exactly
    const queueOverrides = [
      { key:'meshal_abdullah', type:'leave', status:'overdue', daysAgo:4 },
      { key:'rayan_mohammed', type:'overtime', status:'needs_policy_check', daysAgo:2 },
      { key:'sadeem_ahmed', type:'expense', status:'ready', daysAgo:1 },
      { key:'joud_khalid', type:'leave', status:'overdue', daysAgo:2 },
    ];
    for (const qo of queueOverrides) {
      const empId = empIds[qo.key];
      if (!empId) continue;
      await client.query('DELETE FROM requests WHERE employee_id = $1', [empId]);
      const sub = new Date(today);
      sub.setDate(sub.getDate() - qo.daysAgo);
      await client.query(
        'INSERT INTO requests (employee_id, type, submitted_at, status) VALUES ($1,$2,$3,$4)',
        [empId, qo.type, sub.toISOString(), qo.status]
      );
    }

    console.log('Seeding overtime records...');
    for (const o of OVERTIME_DATA) {
      const empId = empIds[o.key];
      if (!empId) continue;
      await client.query(
        'INSERT INTO overtime_records (employee_id, month, hours, approved_by) VALUES ($1,$2,$3,$4)',
        [empId, o.month, o.hours, o.approvedBy]
      );
    }

    console.log('Seeding training completions...');
    for (const t of TRAINING_COMPLETIONS) {
      const empId = empIds[t.key];
      if (!empId) continue;
      await client.query(
        'INSERT INTO training_completions (employee_id, course_title, completed_date, score) VALUES ($1,$2,$3,$4)',
        [empId, t.course, t.date, t.score]
      );
    }

    console.log('Seeding disciplinary records...');
    for (const d of DISCIPLINARY_DATA) {
      const empId = empIds[d.key];
      if (!empId) continue;
      await client.query(
        'INSERT INTO disciplinary_records (employee_id, type, reason, issued_date, issued_by) VALUES ($1,$2,$3,$4,$5)',
        [empId, d.type, d.reason, d.date, d.by]
      );
    }

    console.log('Seeding headcount requests...');
    for (const h of HEADCOUNT_REQUESTS) {
      const deptId = deptIds[h.dept];
      if (!deptId) continue;
      await client.query(
        'INSERT INTO headcount_requests (department_id, role_title, grade, justification, status, requested_by, requested_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [deptId, h.role, h.grade, h.justification, h.status, h.requestedBy, h.requestedDate]
      );
    }

    console.log('Seeding exit records...');
    for (const e of EXIT_RECORDS) {
      await client.query(
        'INSERT INTO exit_records (emp_name, role, department, exit_date, exit_type, tenure_years, exit_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [e.name, e.role, e.dept, e.date, e.type, e.tenure, e.reason]
      );
    }

    console.log('Seed complete!');
    console.log(`Seeded: ${ALL_EMPLOYEES.length} employees, ${Object.keys(COURSES).reduce((s,k) => s + COURSES[k].length, 0)} courses`);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
