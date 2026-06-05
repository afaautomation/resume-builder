/**
 * Local ATS Analysis Service
 * Performs structural and keyword-based scoring without API costs.
 */

const HIGH_IMPACT_KEYWORDS = [
  'leadership', 'management', 'coordinated', 'developed', 'implemented',
  'growth', 'revenue', 'optimized', 'scaled', 'architected',
  'strategic', 'mentored', 'collaborated', 'delivered', 'automated'
];

const COMMON_SKILLS = [
  'javascript', 'python', 'java', 'react', 'node', 'aws', 'docker',
  'sql', 'nosql', 'agile', 'scrum', 'project management', 'communication',
  'typescript', 'go', 'rust', 'cloud', 'kubernetes', 'git'
];

class LocalAtsService {
  analyze(resumeData) {
    const feedback = [];
    let score = 0;
    const maxScore = 100;

    // 1. Contact Information (15 pts)
    const contact = resumeData.contact || {};
    const contactChecks = [
      { id: 'email', label: 'Email', passed: !!contact.email, detail: 'Professional email address found.' },
      { id: 'phone', label: 'Phone', passed: !!contact.phone, detail: 'Phone number provided.' },
      { id: 'linkedin', label: 'LinkedIn', passed: !!contact.linkedin, detail: 'LinkedIn profile linked.' }
    ];
    contactChecks.forEach(c => {
      feedback.push(c);
      if (c.passed) score += 5;
    });

    // 2. Structural Sections (20 pts)
    const sections = [
      { id: 'summary', label: 'Professional Summary', passed: !!resumeData.summary && resumeData.summary.length > 50 },
      { id: 'experience', label: 'Work Experience', passed: Array.isArray(resumeData.experience) && resumeData.experience.length > 0 },
      { id: 'skills', label: 'Skills Section', passed: Array.isArray(resumeData.skills) && resumeData.skills.length > 3 },
      { id: 'education', label: 'Education Section', passed: Array.isArray(resumeData.education) && resumeData.education.length > 0 },
      { id: 'projects', label: 'Projects Section', passed: Array.isArray(resumeData.projects) && resumeData.projects.length > 0 },
      { id: 'certifications', label: 'Certifications', passed: Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0 }
    ];
    sections.forEach(s => {
      s.detail = s.passed ? `${s.label} is well-formatted.` : `Missing or too short ${s.label.toLowerCase()}.`;
      feedback.push(s);
      if (s.passed) score += 5;
    });

    // 3. Content Quality & Impact (35 pts)
    const allText = JSON.stringify(resumeData).toLowerCase();

    // Keyword Matching
    const foundImpactWords = HIGH_IMPACT_KEYWORDS.filter(word => allText.includes(word));
    const impactScore = Math.min(foundImpactWords.length * 4, 20);
    score += impactScore;
    feedback.push({
      id: 'impact_words',
      label: 'Action Verbs',
      passed: foundImpactWords.length >= 3,
      detail: `Found ${foundImpactWords.length} strong action verbs.`,
      suggestion: foundImpactWords.length < 3 ? 'Use more action verbs like "developed", "managed", or "optimized".' : null
    });

    // Skills Depth
    const foundSkills = COMMON_SKILLS.filter(skill => allText.includes(skill));
    const skillScore = Math.min(foundSkills.length * 3, 15);
    score += skillScore;
    feedback.push({
      id: 'skill_density',
      label: 'Skill Density',
      passed: foundSkills.length >= 5,
      detail: `Detected ${foundSkills.length} industry-standard skills.`,
      suggestion: foundSkills.length < 5 ? 'Add more specific technical or soft skills.' : null
    });

    // 4. Formatting & Length (30 pts)
    const wordCount = allText.split(/\s+/).length;
    let lengthPassed = wordCount > 200 && wordCount < 1000;
    feedback.push({
      id: 'length',
      label: 'Resume Length',
      passed: lengthPassed,
      detail: `Content length is approximately ${wordCount} words.`,
      suggestion: wordCount < 200 ? 'Your resume is too short. Add more detail to your experience.' : (wordCount > 1000 ? 'Your resume is too long. Try to keep it under 2 pages.' : null)
    });
    if (lengthPassed) score += 30;

    // Final Grade
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';

    return {
      score,
      grade,
      feedback,
      topImprovements: feedback
        .filter(f => !f.passed)
        .map(f => f.suggestion || `Improve your ${f.label}`)
        .slice(0, 3)
    };
  }
}

module.exports = new LocalAtsService();
