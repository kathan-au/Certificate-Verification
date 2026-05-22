CREATE DATABASE IF NOT EXISTS cert_verification;
USE cert_verification;

CREATE TABLE IF NOT EXISTS certificates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  certificate_id VARCHAR(80) NOT NULL UNIQUE,
  student_name VARCHAR(160) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  program VARCHAR(180) NOT NULL,
  grade VARCHAR(80) NOT NULL,
  issue_date DATE NOT NULL,
  university_name VARCHAR(180) NOT NULL,
  certificate_hash VARCHAR(66) NOT NULL,
  qr_token VARCHAR(96) NOT NULL UNIQUE,
  blockchain_tx_hash VARCHAR(66),
  issuer_wallet VARCHAR(42),
  issued_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_certificate_token (qr_token),
  INDEX idx_certificate_hash (certificate_hash)
);

CREATE TABLE IF NOT EXISTS certificate_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  certificate_id VARCHAR(80) NOT NULL,
  png_file_path VARCHAR(255) NOT NULL,
  qr_image_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificate_files_certificate
    FOREIGN KEY (certificate_id)
    REFERENCES certificates(certificate_id)
    ON DELETE CASCADE
);
