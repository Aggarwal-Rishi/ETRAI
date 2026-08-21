/**
 * ETRAI Database Backup, Integrity & Disaster Recovery Utility
 * 
 * Provides automated snapshots, WAL checkpointing, SHA256 checksums,
 * integrity verification (PRAGMA integrity_check), and safe restore capability.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('./prisma');

const BACKUP_DIR = path.resolve(__dirname, '../../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Computes SHA256 hash of a file for integrity tracking
 */
function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Verifies SQLite database integrity using PRAGMA integrity_check
 */
async function verifyDatabaseIntegrity() {
  try {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
      const result = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
      const status = Array.isArray(result) && result[0] ? (result[0].integrity_check || Object.values(result[0])[0]) : 'ok';
      return {
        intact: status === 'ok',
        status
      };
    }
    // For external databases, ping connection
    await prisma.$queryRawUnsafe('SELECT 1;');
    return { intact: true, status: 'operational' };
  } catch (err) {
    return {
      intact: false,
      status: err.message
    };
  }
}

/**
 * Creates an atomic backup snapshot of the database
 */
async function createDatabaseBackup(customLabel = '') {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  
  if (!dbUrl.startsWith('file:')) {
    return {
      success: false,
      message: 'Automated file snapshots are designed for SQLite file-based databases. For external databases, use pg_dump / native cloud backups.',
      databaseType: 'external'
    };
  }

  const rawPath = dbUrl.replace('file:', '').replace(/^\.\//, '');
  const dbFilePath = path.isAbsolute(rawPath) 
    ? rawPath 
    : path.resolve(__dirname, '../../prisma', rawPath);

  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Database source file not found at: ${dbFilePath}`);
  }

  // 1. Force WAL checkpoint to flush in-memory and WAL logs to disk before backup
  try {
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) {
    // Ignore if unsupported
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = customLabel ? `_${customLabel.replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
  const backupFileName = `etrai_backup_${timestamp}${label}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  // 2. Perform copy
  fs.copyFileSync(dbFilePath, backupFilePath);

  const checksum = getFileSha256(backupFilePath);
  const sizeBytes = fs.statSync(backupFilePath).size;

  const metadata = {
    backupFileName,
    backupFilePath,
    timestamp: new Date().toISOString(),
    sizeBytes,
    sha256: checksum,
    sourceDatabase: dbFilePath
  };

  const metadataPath = backupFilePath.replace(/\.db$/, '.meta.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return {
    success: true,
    backupFileName,
    backupFilePath,
    sizeBytes,
    sha256: checksum,
    timestamp: metadata.timestamp
  };
}

/**
 * Lists available database backup snapshots
 */
function listDatabaseBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const files = fs.readdirSync(BACKUP_DIR);
  const dbFiles = files.filter(f => f.endsWith('.db'));

  return dbFiles.map(file => {
    const filePath = path.join(BACKUP_DIR, file);
    const metaPath = path.join(BACKUP_DIR, file.replace(/\.db$/, '.meta.json'));
    const stats = fs.statSync(filePath);

    let metadata = null;
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {}
    }

    return {
      fileName: file,
      sizeBytes: stats.size,
      createdAt: stats.birthtime || stats.mtime,
      sha256: metadata ? metadata.sha256 : getFileSha256(filePath)
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Restores the database from a specified backup file
 */
async function restoreDatabaseBackup(backupFileName) {
  // Prevent path traversal
  const sanitizedName = path.basename(backupFileName);
  const backupFilePath = path.join(BACKUP_DIR, sanitizedName);

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup snapshot file does not exist: ${sanitizedName}`);
  }

  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  if (!dbUrl.startsWith('file:')) {
    throw new Error('Restore from file is only supported for file-based databases.');
  }

  const rawPath = dbUrl.replace('file:', '').replace(/^\.\//, '');
  const dbFilePath = path.isAbsolute(rawPath) 
    ? rawPath 
    : path.resolve(__dirname, '../../prisma', rawPath);

  // Disconnect active prisma client before file overwrite
  if (prisma && prisma.$disconnect) {
    await prisma.$disconnect();
  }

  fs.copyFileSync(backupFilePath, dbFilePath);

  return {
    success: true,
    restoredFrom: sanitizedName,
    targetFile: dbFilePath,
    restoredAt: new Date().toISOString()
  };
}

module.exports = {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
  verifyDatabaseIntegrity,
  getFileSha256,
  BACKUP_DIR
};
