/**
 * Writing Tips Service
 * Provides inline expert tips for each resume section.
 */

const TIPS = {
  summary: [
    {
      id: 'sum_1',
      tip: 'Start with your job title and years of experience.',
      example: '"Results-driven Software Engineer with 5+ years building scalable web apps…"',
      tags: ['opening', 'length'],
    },
    {
      id: 'sum_2',
      tip: 'Mention 2–3 core competencies aligned with your target role.',
      example: '"Specialized in React, Node.js, and cloud-native architecture."',
      tags: ['skills', 'alignment'],
    },
    {
      id: 'sum_3',
      tip: 'Close with a value statement — what you bring to an employer.',
      example: '"Passionate about delivering high-quality software on time and under budget."',
      tags: ['value', 'closing'],
    },
    {
      id: 'sum_4',
      tip: 'Keep it to 40–80 words. Recruiters spend ~7 seconds on initial scan.',
      example: null,
      tags: ['length', 'ats'],
    },
    {
      id: 'sum_5',
      tip: 'Avoid first-person pronouns ("I", "my"). Write in third-person implied.',
      example: '"Delivered 15+ client projects" not "I delivered 15+ client projects".',
      tags: ['style'],
    },
  ],

  experience: [
    {
      id: 'exp_1',
      tip: 'Use the CAR method: Context → Action → Result.',
      example: '"Redesigned checkout flow (C) using React + TypeScript (A), reducing cart abandonment by 22% (R)."',
      tags: ['structure', 'results'],
    },
    {
      id: 'exp_2',
      tip: 'Start every bullet with a strong action verb.',
      example: '"Led, Built, Drove, Increased, Reduced, Streamlined, Launched…"',
      tags: ['verbs', 'ats'],
    },
    {
      id: 'exp_3',
      tip: 'Quantify everything you can: %, $, users, time saved.',
      example: '"Cut CI/CD pipeline time from 45 min to 8 min (82% improvement)."',
      tags: ['metrics', 'ats'],
    },
    {
      id: 'exp_4',
      tip: 'List most recent job first (reverse chronological order).',
      example: null,
      tags: ['format'],
    },
    {
      id: 'exp_5',
      tip: 'Aim for 3–5 bullets per role; 6+ only for senior or long-tenure roles.',
      example: null,
      tags: ['length'],
    },
    {
      id: 'exp_6',
      tip: 'Tailor bullet points to keywords in the job description.',
      example: '"Implemented microservices architecture" if the JD mentions microservices.',
      tags: ['ats', 'keywords'],
    },
  ],

  education: [
    {
      id: 'edu_1',
      tip: 'Include institution name, degree, field of study, and graduation year.',
      example: '"B.S. Computer Science, Stanford University, 2021"',
      tags: ['completeness'],
    },
    {
      id: 'edu_2',
      tip: 'List GPA only if 3.5+ or specifically requested by the employer.',
      example: '"GPA: 3.8/4.0 (Magna Cum Laude)"',
      tags: ['optional'],
    },
    {
      id: 'edu_3',
      tip: 'Recent graduates: place Education before Experience.',
      example: null,
      tags: ['order', 'new-grad'],
    },
    {
      id: 'edu_4',
      tip: 'Include relevant coursework, thesis, or honors if under 3 years of experience.',
      example: '"Relevant: Machine Learning, Distributed Systems, Algorithms"',
      tags: ['new-grad', 'detail'],
    },
  ],

  skills: [
    {
      id: 'ski_1',
      tip: 'Group skills into categories for readability: Languages, Frameworks, Tools, Soft Skills.',
      example: '"Languages: Python, Go, TypeScript | Frameworks: React, FastAPI, Django"',
      tags: ['organization', 'readability'],
    },
    {
      id: 'ski_2',
      tip: 'Mirror keywords from the job description exactly (ATS matches exact strings).',
      example: 'Job says "Kubernetes" → use "Kubernetes", not just "containers".',
      tags: ['ats', 'keywords'],
    },
    {
      id: 'ski_3',
      tip: 'Only list skills you can discuss confidently in an interview.',
      example: null,
      tags: ['honesty'],
    },
    {
      id: 'ski_4',
      tip: 'Omit outdated technologies unless the role requires them.',
      example: '"Internet Explorer 6 optimization" is probably not relevant today.',
      tags: ['relevance'],
    },
  ],

  certifications: [
    {
      id: 'cert_1',
      tip: 'Include full name, issuing organization, and expiry date if applicable.',
      example: '"AWS Certified Solutions Architect – Associate | Amazon, 2023 (expires 2026)"',
      tags: ['completeness'],
    },
    {
      id: 'cert_2',
      tip: 'List industry-recognized certs prominently — they\'re major ATS keywords.',
      example: 'PMP, AWS, GCP, CPA, CISSP, Scrum Master, etc.',
      tags: ['ats', 'priority'],
    },
  ],

  projects: [
    {
      id: 'proj_1',
      tip: 'Include project name, tech stack, your role, and a measurable outcome.',
      example: '"Built a real-time chat app (React, Socket.io, Redis) used by 2,000+ users."',
      tags: ['structure', 'metrics'],
    },
    {
      id: 'proj_2',
      tip: 'Link to GitHub or live demo for technical roles.',
      example: '"GitHub: github.com/username/project"',
      tags: ['links', 'tech'],
    },
    {
      id: 'proj_3',
      tip: 'Prioritize projects relevant to the role you are applying for.',
      example: null,
      tags: ['relevance'],
    },
  ],

  contact: [
    {
      id: 'con_1',
      tip: 'Use a professional email (firstname.lastname@domain.com).',
      example: '"john.doe@gmail.com" is better than "coolkid99@yahoo.com".',
      tags: ['professionalism'],
    },
    {
      id: 'con_2',
      tip: 'Add LinkedIn profile URL — recruiters will check it.',
      example: '"linkedin.com/in/johndoe"',
      tags: ['links'],
    },
    {
      id: 'con_3',
      tip: 'City + State/Country is sufficient. No need for full street address.',
      example: '"San Francisco, CA" or "Remote"',
      tags: ['privacy', 'format'],
    },
    {
      id: 'con_4',
      tip: 'Ensure your phone number has a professional voicemail set up.',
      example: null,
      tags: ['professionalism'],
    },
  ],

  languages: [
    {
      id: 'lang_1',
      tip: 'Use standard proficiency levels: Native, Fluent, Professional, Conversational, Elementary.',
      example: '"Spanish – Fluent | French – Conversational"',
      tags: ['format'],
    },
  ],

  awards: [
    {
      id: 'awd_1',
      tip: 'Include the award name, issuing body, and year.',
      example: '"Dean\'s List, University of Michigan, 2019–2021"',
      tags: ['completeness'],
    },
    {
      id: 'awd_2',
      tip: 'Briefly explain the significance if the award is not well-known.',
      example: '"Top 5% of graduating class (awarded to 12 of 250 students)"',
      tags: ['context'],
    },
  ],
};

/**
 * Returns all tips for a given section.
 * @param {string} section - e.g. 'experience', 'skills', 'summary'
 */
function getTipsForSection(section) {
  return TIPS[section.toLowerCase()] || [];
}

/**
 * Returns a random tip for a section (useful for inline prompts).
 */
function getRandomTip(section) {
  const tips = getTipsForSection(section);
  if (!tips.length) return null;
  return tips[Math.floor(Math.random() * tips.length)];
}

/**
 * Returns all tips across all sections (used to seed the DB).
 */
function getAllTips() {
  return Object.entries(TIPS).flatMap(([section, tips]) =>
    tips.map((t) => ({ ...t, section }))
  );
}

module.exports = { getTipsForSection, getRandomTip, getAllTips };
