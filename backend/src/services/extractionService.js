const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

// ─── Simple NLP helpers ───────────────────────────────────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}/g;
const URL_RE = /https?:\/\/[^\s]+|linkedin\.com\/[^\s]+|github\.com\/[^\s]+/gi;

const SECTION_PATTERNS = {
  summary: /\b(summary|profile|objective|about me|professional summary)\b/i,
  experience: /\b(experience|employment|work history|career|positions?|jobs?)\b/i,
  education: /\b(education|academic|qualifications?|degrees?|university|college)\b/i,
  skills: /\b(skills?|expertise|technologies|competencies|proficiencies)\b/i,
  certifications: /\b(certifications?|certificates?|licenses?|accreditations?)\b/i,
  projects: /\b(projects?|portfolio|works?|accomplishments?)\b/i,
  languages: /\b(languages?|linguistic)\b/i,
  awards: /\b(awards?|honors?|achievements?|recognitions?)\b/i,
  volunteer: /\b(volunteer|community|civic|social work)\b/i,
  publications: /\b(publications?|papers?|articles?|research)\b/i,
};

const MONTH_NAMES =
  'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
const DATE_RE = new RegExp(
  `(?:${MONTH_NAMES})[\\s.]*\\d{4}|\\d{1,2}[/\\-]\\d{4}|\\d{4}`,
  'gi'
);

// ─── Extraction Utilities ─────────────────────────────────────────────────────

function extractContactInfo(text) {
  const emails = text.match(EMAIL_RE) || [];
  const phones = text.match(PHONE_RE) || [];
  const urls = text.match(URL_RE) || [];

  const linkedin = urls.find((u) => /linkedin/i.test(u)) || '';
  const github = urls.find((u) => /github/i.test(u)) || '';
  const website = urls.find((u) => !/linkedin|github/i.test(u)) || '';

  // Name heuristic: first non-empty line that isn't an email/phone/URL
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const nameLine = lines.find(
    (l) =>
      l.length > 2 &&
      l.length < 60 &&
      !EMAIL_RE.test(l) &&
      !PHONE_RE.test(l) &&
      !/^https?/i.test(l)
  );

  return {
    name: nameLine || '',
    email: emails[0] || '',
    phone: phones[0] || '',
    linkedin,
    github,
    website,
  };
}

function splitIntoSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let currentSection = 'header';
  let buffer = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if the line is a section header
    let matchedSection = null;
    for (const [key, re] of Object.entries(SECTION_PATTERNS)) {
      if (re.test(trimmed) && trimmed.split(' ').length <= 5) {
        matchedSection = key;
        break;
      }
    }

    if (matchedSection) {
      if (buffer.length) sections[currentSection] = buffer.join('\n');
      currentSection = matchedSection;
      buffer = [];
    } else {
      buffer.push(trimmed);
    }
  }
  if (buffer.length) sections[currentSection] = buffer.join('\n');
  return sections;
}

function parseExperienceBlock(text) {
  if (!text) return [];
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const dates = block.match(DATE_RE) || [];
    return {
      company: lines[0] || '',
      title: lines[1] || '',
      startDate: dates[0] || '',
      endDate: dates[1] || 'Present',
      description: lines.slice(2).join(' '),
    };
  });
}

function parseEducationBlock(text) {
  if (!text) return [];
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const dates = block.match(DATE_RE) || [];
    return {
      institution: lines[0] || '',
      degree: lines[1] || '',
      field: lines[2] || '',
      endDate: dates[dates.length - 1] || '',
    };
  });
}

function parseSkills(text) {
  if (!text) return [];
  return text
    .split(/[,;|•·\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 50);
}

function buildResumeData(rawText) {
  const sections = splitIntoSections(rawText);
  const contact = extractContactInfo(sections.header || rawText.slice(0, 500));
  return {
    contact,
    summary: (sections.summary || '').trim(),
    experience: parseExperienceBlock(sections.experience),
    education: parseEducationBlock(sections.education),
    skills: parseSkills(sections.skills),
    certifications: (sections.certifications || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    projects: (sections.projects || '')
      .split(/\n{2,}/)
      .map((b) => ({ title: b.split('\n')[0], description: b.split('\n').slice(1).join(' ') }))
      .filter((p) => p.title),
    languages: parseSkills(sections.languages),
    awards: (sections.awards || '').split('\n').map((l) => l.trim()).filter(Boolean),
  };
}

// ─── File Parsers ─────────────────────────────────────────────────────────────

async function parsePdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await pdfParse(dataBuffer);
  return result.text;
}

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function parseImage(filePath) {
  logger.info(`Running OCR on image: ${filePath}`);
  const { data } = await Tesseract.recognize(filePath, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  return data.text;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

async function extractResumeFromFile(filePath, mimeType) {
  let rawText = '';

  try {
    if (mimeType === 'application/pdf') {
      rawText = await parsePdf(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      rawText = await parseDocx(filePath);
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      rawText = await parseImage(filePath);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    const resumeData = buildResumeData(rawText);
    return { success: true, rawText, resumeData };
  } catch (err) {
    logger.error(`Extraction error: ${err.message}`);
    throw err;
  }
}

module.exports = { extractResumeFromFile, buildResumeData };
