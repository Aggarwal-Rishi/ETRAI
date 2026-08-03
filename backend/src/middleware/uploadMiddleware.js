const multer = require('multer');
const path = require('path');

// Memory storage for fast buffer parsing without disk pollution
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Unsupported file format. Accepted formats are PDF (.pdf), Word Document (.docx), and plain text (.txt).');
    error.status = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB file size limit
  },
  fileFilter
});

module.exports = upload;
