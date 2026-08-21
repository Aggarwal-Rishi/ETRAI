const multer = require('multer');
const path = require('path');

// Memory storage for fast buffer parsing without disk pollution
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [
    '.pdf', '.docx', '.txt',
    '.png', '.jpg', '.jpeg', '.webp',
    '.mp4', '.mov', '.avi', '.webm'
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
  ];

  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    const error = new Error('Unsupported file format. Accepted formats are Documents (.pdf, .docx, .txt), Images (.png, .jpg, .webp), and Videos (.mp4, .mov, .webm).');
    error.status = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit to accommodate video clips & high-res photos
  },
  fileFilter
});

module.exports = upload;
