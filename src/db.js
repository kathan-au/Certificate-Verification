import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'cert_verification',
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: true
    });
  }

  return pool;
}

async function runQuery(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function saveCertificate(certificate, files) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO certificates (
        certificate_id,
        student_name,
        student_id,
        program,
        grade,
        issue_date,
        university_name,
        certificate_hash,
        qr_token,
        issuer_wallet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        certificate.certificateId,
        certificate.studentName,
        certificate.studentId,
        certificate.program,
        certificate.grade,
        certificate.issueDate,
        certificate.universityName,
        certificate.certificateHash,
        certificate.qrToken,
        certificate.issuerWallet || null
      ]
    );

    await connection.execute(
      `INSERT INTO certificate_files (
        certificate_id,
        png_file_path,
        qr_image_path
      ) VALUES (?, ?, ?)`,
      [
        certificate.certificateId,
        files.certificatePath,
        files.qrPath
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getCertificateByToken(token) {
  const rows = await runQuery(
    `SELECT
      c.*,
      f.png_file_path,
      f.qr_image_path
    FROM certificates c
    LEFT JOIN certificate_files f
      ON f.certificate_id = c.certificate_id
    WHERE c.qr_token = :token
    LIMIT 1`,
    { token }
  );

  return rows[0] || null;
}

export async function saveTransactionHash(certificateId, txHash, issuerWallet) {
  const result = await runQuery(
    `UPDATE certificates
     SET blockchain_tx_hash = ?,
         issuer_wallet = ?
     WHERE certificate_id = ?`,
    [txHash, issuerWallet, certificateId]
  );

  return result.affectedRows > 0;
}
