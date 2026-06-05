const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

// Ensure upload subdirectories exist
['resumes', 'avatars', 'temp'].forEach((sub) => {
  const dir = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Disk storage — deterministic filenames */
const resumeStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'resumes'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || `.${ALLOWED_MIME_TYPES[file.mimetype] || 'bin'}`;
    cb(null, `${uuidv4()}${ext}`);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'avatars')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function mimeFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, JPG, PNG`
      )
    );
  }
}

/** Upload middleware for resume imports (pdf / docx / image) */
const uploadResume = multer({
  storage: resumeStorage,
  fileFilter: mimeFilter,
  limits: { fileSize: MAX_SIZE, files: 1 },
}).single('file');

/** Upload middleware for user avatar */
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (imageTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG/PNG/WebP avatars are allowed'));
  },
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('avatar');

/** Wraps multer in a promise so controllers can await it */
function wrapMulter(middleware) {
  return (req, res) =>
    new Promise((resolve, reject) => {
      middleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
}

module.exports = { uploadResume, uploadAvatar, wrapMulter, UPLOAD_DIR };
